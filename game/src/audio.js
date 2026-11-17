// Port Meridian — audio.js
// Fully synthesized WebAudio: no audio files, no network. Engine hum
// follows speed, gunshots are noise bursts, the siren is a wailing
// oscillator, pickups are blips, and two short original radio loops
// are simple oscillator melodies. AudioContext is created only after
// a user gesture (start button); every call is guarded so a missing
// or blocked AudioContext can never break the game.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.radioTimer = null;
    this.radioTrack = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      // Engine hum: sawtooth through a lowpass, gain follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(filt);
      filt.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      // Police siren: triangle wail, LFO on frequency.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 800;
      this.sirenLfo = this.ctx.createOscillator();
      this.sirenLfo.type = 'sine';
      this.sirenLfo.frequency.value = 0.6;
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
    } catch (err) {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  engine(level) {
    if (!this.ctx || !this.engineGain) return;
    try {
      const t = this.ctx.currentTime;
      this.engineGain.gain.setTargetAtTime(level > 0.02 ? 0.05 + level * 0.1 : 0, t, 0.1);
      this.engineOsc.frequency.setTargetAtTime(55 + level * 130, t, 0.1);
    } catch (err) {}
  }

  siren(on) {
    if (!this.ctx || !this.sirenGain) return;
    try {
      this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
    } catch (err) {}
  }

  _noiseBurst(dur, vol, freq) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(filt);
      filt.connect(g);
      g.connect(this.master);
      src.start(t);
    } catch (err) {}
  }

  _tone(freq, dur, vol, type) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch (err) {}
  }

  shot() {
    this._noiseBurst(0.12, 0.5, 1800);
  }

  dryFire() {
    this._tone(1400, 0.05, 0.12, 'square');
  }

  reloadSound() {
    this._tone(520, 0.07, 0.2, 'square');
    setTimeout(() => this._tone(760, 0.07, 0.2, 'square'), 90);
  }

  blip() {
    this._tone(880, 0.12, 0.25);
    setTimeout(() => this._tone(1320, 0.14, 0.25), 110);
  }

  pickup() {
    this._tone(660, 0.1, 0.25);
    setTimeout(() => this._tone(990, 0.16, 0.25), 100);
  }

  crash() {
    this._noiseBurst(0.25, 0.4, 500);
  }

  // Two short original radio loops: simple oscillator melodies.
  // Track 0 is a lazy sunset groove, track 1 a driving night pulse.
  startRadio(track) {
    if (!this.ctx) return;
    this.stopRadio();
    this.radioTrack = track || 0;
    const melodies = [
      [262, 0, 330, 392, 0, 330, 262, 0, 196, 220, 262, 0],
      [220, 220, 277, 330, 330, 277, 220, 0, 196, 220, 262, 330],
    ];
    const notes = melodies[this.radioTrack % melodies.length];
    let i = 0;
    const step = () => {
      if (!this.ctx) return;
      const f = notes[i % notes.length];
      if (f) this._tone(f, 0.22, 0.07, 'triangle');
      i++;
    };
    step();
    this.radioTimer = setInterval(step, 240);
  }

  stopRadio() {
    if (this.radioTimer) {
      clearInterval(this.radioTimer);
      this.radioTimer = null;
    }
  }
}
