import { SIM_MINUTES_PER_REAL_SECOND, SIM_TICK_MS } from './config.js';

// Sim clock: fixed timestep accumulator decoupled from render framerate.
// speed: 0 = paused, 1/2/4 = multiplier on sim-minutes-per-real-second.

export class TimeSystem {
  constructor() {
    this.speed = 1;
    this.minutesOfDay = 6 * 60; // start at 06:00
    this.day = 1;
    this.totalSimMinutes = 0;
    this._accumulatorMs = 0;
    this._listeners = { tick: [], newDay: [], newWeek: [] };
  }

  on(event, cb) {
    this._listeners[event].push(cb);
  }

  _emit(event, payload) {
    for (const cb of this._listeners[event]) cb(payload);
  }

  setSpeed(mult) {
    this.speed = mult;
  }

  get hour() { return this.minutesOfDay / 60; }
  get week() { return Math.floor((this.day - 1) / 7) + 1; }
  get dayOfWeek() { return ((this.day - 1) % 7) + 1; }

  // Time-of-day demand multiplier used by passengers.js. Rush hours spike,
  // midday plateaus, night trickles to near-zero.
  static demandMultiplier(hour) {
    const curve = [
      [0, 0.04], [5, 0.05], [6, 0.25], [7, 1.0], [9, 0.95], [10, 0.35],
      [12, 0.45], [14, 0.35], [16, 0.9], [18, 1.0], [19, 0.55], [21, 0.25],
      [23, 0.08], [24, 0.04],
    ];
    for (let i = 0; i < curve.length - 1; i++) {
      const [h0, v0] = curve[i];
      const [h1, v1] = curve[i + 1];
      if (hour >= h0 && hour <= h1) {
        const t = (hour - h0) / (h1 - h0 || 1);
        return v0 + (v1 - v0) * t;
      }
    }
    return 0.1;
  }

  // Fraction of trips that are "reverse" (commercial/industrial -> residential)
  // vs "forward" (residential -> commercial/industrial) at a given hour.
  static reverseCommuteFraction(hour) {
    if (hour >= 15.5 && hour <= 20) return 0.75;
    if (hour >= 5 && hour <= 11) return 0.08;
    return 0.35;
  }

  // Advance real time by dtMs; runs zero or more fixed sim ticks.
  update(dtMs) {
    if (this.speed <= 0) return;
    this._accumulatorMs += dtMs * this.speed;
    while (this._accumulatorMs >= SIM_TICK_MS) {
      this._accumulatorMs -= SIM_TICK_MS;
      this._tick();
    }
  }

  _tick() {
    const simMinutesPerTick = SIM_MINUTES_PER_REAL_SECOND * (SIM_TICK_MS / 1000);
    this.minutesOfDay += simMinutesPerTick;
    this.totalSimMinutes += simMinutesPerTick;
    this._emit('tick', simMinutesPerTick);

    if (this.minutesOfDay >= 1440) {
      this.minutesOfDay -= 1440;
      this.day += 1;
      this._emit('newDay', this.day);
      if (this.dayOfWeek === 1) this._emit('newWeek', this.week);
    }
  }

  formatClock() {
    const h = Math.floor(this.minutesOfDay / 60);
    const m = Math.floor(this.minutesOfDay % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  formatDate() {
    return `Day ${this.day}, ${this.formatClock()}`;
  }
}
