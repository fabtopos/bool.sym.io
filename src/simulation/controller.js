import { Trajectory } from '../engine/trajectory.js';

/** Owns a single playback timer. Graphs deliberately do not belong to this layer. */
export class SimulationController {
  constructor({ onChange = () => {}, onPlaybackChange = () => {} } = {}) {
    this.onChange = onChange;
    this.onPlaybackChange = onPlaybackChange;
    this.interval = 700;
    this.timer = null;
    this.playing = false;
    this.trajectory = null;
  }
  setNetwork(network, initialState) {
    this.pause();
    this.network = network;
    this.reset(initialState);
  }
  reset(initialState = this.initialState) {
    this.pause();
    this.network.validateState(initialState);
    this.initialState = initialState;
    this.trajectory = new Trajectory(this.network, initialState);
    this.onChange(this.trajectory);
  }
  step() {
    if (!this.trajectory || this.trajectory.terminal) return;
    this.trajectory.step();
    if (this.trajectory.terminal) this.pause();
    this.onChange(this.trajectory);
  }
  play() {
    if (this.playing || !this.trajectory || this.trajectory.terminal) return;
    this.playing = true;
    this.onPlaybackChange(true);
    this.schedule();
  }
  schedule() {
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.playing) return;
      this.step();
      if (this.playing) this.schedule();
    }, this.interval);
  }
  pause() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const wasPlaying = this.playing;
    this.playing = false;
    if (wasPlaying) this.onPlaybackChange(false);
  }
  setSpeed(stepsPerSecond) {
    if (!Number.isFinite(stepsPerSecond) || stepsPerSecond <= 0) {
      throw new Error('Playback speed must be a positive number.');
    }
    this.interval = 1000 / stepsPerSecond;
    if (this.playing) {
      clearTimeout(this.timer);
      this.schedule();
    }
  }
  destroy() { this.pause(); }
}
