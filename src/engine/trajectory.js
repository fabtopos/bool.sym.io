/** A deterministic trajectory that stops on its first repeated state. */
export class Trajectory {
  constructor(network, initialState) {
    network.validateState(initialState);
    this.network = network;
    this.history = [{ time: 0, state: initialState }];
    this.time = 0;
    this.currentState = initialState;
    this.terminal = null;
    this.visited = new Map([[initialState, 0]]);
  }

  /** Advance once and return the current binary state. Terminal calls are no-ops. */
  step() {
    if (this.terminal) return this.currentState;
    const previous = this.currentState;
    const next = this.network.nextState(previous);
    this.time += 1;
    this.currentState = next;
    this.history.push({ time: this.time, state: next });

    // Fixed points receive their own outcome, even though they repeat a state.
    if (next === previous) {
      this.terminal = {
        type: 'fixed',
        period: 1,
        states: [next],
        entryTime: this.visited.get(next),
      };
    } else if (this.visited.has(next)) {
      const entryTime = this.visited.get(next);
      this.terminal = {
        type: 'cycle',
        period: this.time - entryTime,
        states: this.history.slice(entryTime, this.time).map(({ state }) => state),
        entryTime,
      };
    } else {
      this.visited.set(next, this.time);
    }
    return this.currentState;
  }
}
