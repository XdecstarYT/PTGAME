// Everything here is synthesized with the Web Audio API - there are no
// external sound files to fetch. Audio starts muted (autoplay policies
// require a user gesture anyway); toggleMute() both unmutes and resumes
// the context, so it doubles as the "turn sound on" action.
export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.muted = true;
    this.masterGain = null;
    this.ambienceGain = null;
    this.rainGain = null;
    this._lastChimeAt = -Infinity;
  }

  _ensureContext() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0;
    this.masterGain.connect(this.ctx.destination);
    this._buildAmbience();
    this._buildRainLayer();
  }

  toggleMute() {
    this._ensureContext();
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.muted = !this.muted;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.15);
    return !this.muted;
  }

  _buildAmbience() {
    const bufferSize = 2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.2;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 350;
    this.ambienceGain = this.ctx.createGain();
    this.ambienceGain.gain.value = 0.03;
    noise.connect(filter).connect(this.ambienceGain).connect(this.masterGain);
    noise.start();
  }

  // mult: the same 0..1-ish demand multiplier passengers.js uses for rush hour
  setRushHourIntensity(mult) {
    if (!this.ctx || !this.ambienceGain) return;
    const target = 0.02 + Math.max(0, Math.min(1, mult)) * 0.09;
    this.ambienceGain.gain.setTargetAtTime(target, this.ctx.currentTime, 2);
  }

  // A second, brighter noise layer (highpass instead of lowpass) reading as
  // rain patter, gated by economy.js's ambient isRaining day-to-day weather.
  _buildRainLayer() {
    const bufferSize = 2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1800;
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0;
    noise.connect(filter).connect(this.rainGain).connect(this.masterGain);
    noise.start();
  }

  setRaining(isRaining) {
    if (!this.ctx || !this.rainGain) return;
    this.rainGain.gain.setTargetAtTime(isRaining ? 0.05 : 0, this.ctx.currentTime, 3);
  }

  // hornStyle (model.hornStyle - see vehicleStyleDefs.js) is a pure audio
  // flavor choice, not a stat - 'standard' reproduces the exact chime this
  // always played, so old saved designs (with no hornStyle field) sound
  // unchanged.
  playArrivalChime(hornStyle = 'standard') {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this._lastChimeAt < 0.3) return; // throttle so a busy city isn't a wall of dings
    this._lastChimeAt = now;
    if (hornStyle === 'two_tone') {
      this._blip(440, now, 0.12, 0.05, 'square');
      this._blip(330, now + 0.13, 0.14, 0.05, 'square');
    } else if (hornStyle === 'air_horn') {
      this._blip(180, now, 0.35, 0.06, 'sawtooth');
    } else if (hornStyle === 'electronic_chime') {
      this._blip(660, now, 0.08, 0.035);
      this._blip(880, now + 0.09, 0.08, 0.035);
      this._blip(1100, now + 0.18, 0.1, 0.035);
    } else {
      this._blip(880, now, 0.09, 0.045);
      this._blip(1320, now + 0.1, 0.09, 0.035);
    }
  }

  _blip(freq, when, duration, gainAmt, type = 'sine') {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(gainAmt, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain).connect(this.masterGain);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  // A short engine/rail blip themed by powertrain, played alongside the chime.
  playDeparture(powertrainId) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime + 0.25;
    const presets = {
      diesel: { type: 'sawtooth', freq: 70, duration: 0.5, gain: 0.05 },
      hybrid: { type: 'triangle', freq: 120, duration: 0.4, gain: 0.045 },
      electric: { type: 'sine', freq: 380, duration: 0.35, gain: 0.03, sweep: true },
      hydrogen: { type: 'sine', freq: 180, duration: 0.4, gain: 0.03 },
      third_rail: { type: 'sine', freq: 480, duration: 0.3, gain: 0.035, sweep: true },
    };
    const p = presets[powertrainId] || presets.diesel;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = p.type;
    osc.frequency.setValueAtTime(p.freq, now);
    if (p.sweep) osc.frequency.exponentialRampToValueAtTime(p.freq * 1.8, now + p.duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(p.gain, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + p.duration);
    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + p.duration + 0.05);
  }
}
