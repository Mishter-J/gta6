// Port Meridian — all sound is synthesized live with WebAudio.
// No audio files: engine hum, gunshots, sirens, UI blips and two original
// radio loops are built from oscillators and filtered noise.

import { RADIO } from './config.js';

function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.radioIndex = 0;
    this.radioOn = true;
    this.radioTimer = null;
    this.radioStep = 0;
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.noiseBuffer = null;
  }

  /** Must be called from a user gesture; safe to call repeatedly. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._startEngine();
    this._startSiren();
    this._startRadio();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  _startEngine() {
    const c = this.ctx;
    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineOsc1 = c.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.value = 55;
    this.engineOsc2 = c.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 28;
    const g2 = c.createGain();
    g2.gain.value = 0.4;
    this.engineOsc1.connect(filter);
    this.engineOsc2.connect(g2);
    g2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc1.start();
    this.engineOsc2.start();
  }

  /** speed01: 0..1 of top speed; throttle: 0..1. */
  setEngine(speed01, throttle) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const freq = 48 + speed01 * 130 + throttle * 22;
    this.engineOsc1.frequency.setTargetAtTime(freq, t, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(freq / 2, t, 0.06);
    const vol = throttle > 0.02 || speed01 > 0.02 ? 0.05 + speed01 * 0.05 + throttle * 0.03 : 0;
    this.engineGain.gain.setTargetAtTime(vol, t, 0.08);
  }

  _startSiren() {
    const c = this.ctx;
    this.sirenGain = c.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc = c.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 800;
    this.sirenLfo = c.createOscillator();
    this.sirenLfo.type = 'square';
    this.sirenLfo.frequency.value = 0.55;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 160;
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  /** distance: metres to the nearest cop; 0 = silent. */
  setSiren(distance) {
    if (!this.ctx) return;
    const vol = distance <= 0 ? 0 : Math.max(0, 0.09 - distance * 0.0011);
    this.sirenGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.2);
  }

  _noiseBurst(duration, filterFreq, volume, type = 'bandpass') {
    if (!this.ctx) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    src.stop(c.currentTime + duration);
  }

  _tone(freq, duration, volume, type = 'sine', when = 0) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  gunshot() { this._noiseBurst(0.14, 1800, 0.5); this._tone(120, 0.1, 0.3, 'sine'); }
  punch() { this._noiseBurst(0.08, 500, 0.35, 'lowpass'); }
  crash(intensity = 1) { this._noiseBurst(0.3, 300, 0.4 * intensity, 'lowpass'); }
  blip() { this._tone(880, 0.07, 0.15, 'sine'); }
  pickup() { this._tone(660, 0.09, 0.2, 'sine'); this._tone(990, 0.12, 0.2, 'sine', 0.08); }
  missionComplete() {
    [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.22, 0.22, 'triangle', i * 0.11));
  }
  busted() { [392, 330, 262].forEach((f, i) => this._tone(f, 0.3, 0.22, 'sawtooth', i * 0.16)); }
  phoneRing() { this._tone(1250, 0.12, 0.14, 'sine'); this._tone(1250, 0.12, 0.14, 'sine', 0.2); }

  cycleRadio() {
    this.radioIndex = (this.radioIndex + 1) % RADIO.length;
    this.radioStep = 0;
    return RADIO[this.radioIndex].name;
  }

  radioName() { return RADIO[this.radioIndex].name; }

  _startRadio() {
    // Original two loops, scheduled a bar ahead: bass + pad + hats.
    const loops = [
      { bpm: 96, root: 45, bass: [0, 0, 7, 5, 0, 0, 10, 7], pad: [0, 3, 7, 10] },
      { bpm: 112, root: 41, bass: [0, 0, 5, 3, 0, 8, 7, 5], pad: [0, 5, 7, 12] },
    ];
    const tick = () => {
      if (!this.ctx) return;
      const station = RADIO[this.radioIndex];
      if (station.bpm === 0) return;
      const loop = loops[this.radioIndex];
      const stepDur = 60 / station.bpm / 2; // eighth notes
      const step = this.radioStep % 16;
      const t0 = this.ctx.currentTime + 0.05;
      if (step % 2 === 0) {
        const note = loop.root + loop.bass[(step / 2) | 0];
        this._toneAt(midiToFreq(note), stepDur * 1.8, 0.16, 'triangle', t0);
      }
      if (step === 0 || step === 8) {
        for (const iv of loop.pad) {
          this._toneAt(midiToFreq(loop.root + 24 + iv), stepDur * 8, 0.035, 'sine', t0);
        }
      }
      if (step % 2 === 1) this._noiseBurstAt(0.03, 6000, 0.05, t0);
      this.radioStep++;
      this.radioTimer = setTimeout(tick, stepDur * 1000);
    };
    this.radioTimer = setTimeout(tick, 100);
  }

  _toneAt(freq, duration, volume, type, t0) {
    if (!this.ctx) return;
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  _noiseBurstAt(duration, filterFreq, volume, t0) {
    if (!this.ctx) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = c.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = filterFreq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
    src.stop(t0 + duration);
  }
}
