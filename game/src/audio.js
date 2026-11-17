// audio.js — fully synthesized WebAudio for Port Meridian. No audio
// files: engine hum, gunshots, sirens, pickup blips and two short
// original radio loops are all built from oscillators and noise buffers.
// The context is created only after a user gesture (start button / key).

const NOTE_FREQ = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0,
};

// Two original 16-step loops, written for this game (not sampled music).
const RADIO_LOOPS = [
  {
    name: 'Harbor Lights FM',
    bpm: 96,
    wave: 'triangle',
    steps: ['C4', null, 'E4', null, 'G4', null, 'E4', null, 'A4', null, 'G4', 'E4', 'D4', null, 'C4', null],
  },
  {
    name: 'Meridian Nights',
    bpm: 112,
    wave: 'sawtooth',
    steps: ['A3', 'C4', null, 'E4', null, 'D4', 'C4', null, 'G3', null, 'B3', null, 'D4', 'E4', null, null],
  },
];

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.radioTimer = null;
    this.radioStep = 0;
    this.radioIndex = 0;
    this.radioOn = false;
    this.noiseBuffer = null;
  }

  // Called from the first user gesture; safe to call repeatedly.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    // Shared white-noise buffer for gunshots and impacts.
    const len = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._startEngine();
    this._startSiren();
  }

  _startEngine() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 27.5;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineOsc.connect(filter);
    this.engineOsc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  // Engine hum follows vehicle speed; silent on foot.
  setEngine(speedNorm, driving) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + 0.11 * speedNorm : 0.0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + 130 * speedNorm, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(26 + 65 * speedNorm, t, 0.1);
  }

  _startSiren() {
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 750;
    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.type = 'sine';
    this.sirenLfo.frequency.value = 0.55;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 320;
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  // Siren fades in with the wanted level.
  setSiren(wanted) {
    if (!this.ctx || !this.sirenGain) return;
    const target = wanted > 0 ? 0.02 + 0.012 * wanted : 0;
    this.sirenGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
  }

  _blip(freq, dur, type, vol, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  gunshot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, t);
    filter.frequency.exponentialRampToValueAtTime(220, t + 0.14);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 0.4, 0.2);
    this._blip(160, 0.08, 'square', 0.18);
  }

  // Dry click when the magazine is empty.
  dryClick() {
    this._blip(1400, 0.04, 'square', 0.08);
  }

  pickup() {
    this._blip(660, 0.09, 'sine', 0.22);
    this._blip(990, 0.14, 'sine', 0.22, 0.09);
  }

  cash() {
    this._blip(880, 0.08, 'triangle', 0.2);
    this._blip(1174, 0.08, 'triangle', 0.2, 0.07);
    this._blip(1568, 0.16, 'triangle', 0.2, 0.14);
  }

  crash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 300;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 0.5, 0.35);
  }

  missionSting() {
    this._blip(523, 0.12, 'triangle', 0.2);
    this._blip(659, 0.12, 'triangle', 0.2, 0.1);
    this._blip(784, 0.22, 'triangle', 0.22, 0.2);
  }

  // Two original radio loops; cycles the station each call.
  toggleRadio() {
    if (!this.ctx) return null;
    if (this.radioOn) {
      this.radioOn = false;
      if (this.radioTimer) clearInterval(this.radioTimer);
      this.radioTimer = null;
      return null;
    }
    this.radioOn = true;
    this.radioIndex = (this.radioIndex + 1) % RADIO_LOOPS.length;
    const loop = RADIO_LOOPS[this.radioIndex];
    const stepMs = (60 / loop.bpm / 2) * 1000;
    this.radioStep = 0;
    this.radioTimer = setInterval(() => {
      if (!this.ctx) return;
      const note = loop.steps[this.radioStep % loop.steps.length];
      if (note) {
        const osc = this.ctx.createOscillator();
        osc.type = loop.wave;
        osc.frequency.value = NOTE_FREQ[note];
        const g = this.ctx.createGain();
        const t = this.ctx.currentTime;
        g.gain.setValueAtTime(0.07, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + stepMs / 1000 * 0.9);
        osc.connect(g);
        g.connect(this.master);
        osc.start(t);
        osc.stop(t + stepMs / 1000);
      }
      this.radioStep += 1;
    }, stepMs);
    return loop.name;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }
}
