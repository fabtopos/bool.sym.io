import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from '../src/examples.js';
import { BooleanNetwork } from '../src/engine/network.js';
import { SimulationController } from '../src/simulation/controller.js';

const makeExample = (id) => new BooleanNetwork(EXAMPLES.find((example) => example.id === id).variables);

function createController(network = makeExample('inverting-ring'), state = '000') {
  // Capture values immediately: each callback receives the same evolving trajectory.
  const observed = [];
  const onChange = vi.fn((trajectory) => observed.push({
    time: trajectory.time,
    state: trajectory.currentState,
    terminal: trajectory.terminal,
  }));
  const onPlaybackChange = vi.fn();
  const controller = new SimulationController({ onChange, onPlaybackChange });
  controller.setNetwork(network, state);
  return { controller, observed, onChange, onPlaybackChange };
}

describe('simulation playback controller', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('initializes a fresh trajectory and reports its initial configuration', () => {
    const { controller, observed, onPlaybackChange } = createController();
    expect(controller.playing).toBe(false);
    expect(controller.trajectory.history).toEqual([{ time: 0, state: '000' }]);
    expect(observed).toEqual([{ time: 0, state: '000', terminal: null }]);
    expect(onPlaybackChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('schedules exactly one timer despite repeated Play calls', () => {
    const { controller, observed, onPlaybackChange } = createController();
    controller.play();
    controller.play();
    controller.play();
    expect(vi.getTimerCount()).toBe(1);
    expect(onPlaybackChange.mock.calls).toEqual([[true]]);
    vi.advanceTimersByTime(699);
    expect(controller.trajectory.time).toBe(0);
    vi.advanceTimersByTime(1);
    expect(observed.at(-1)).toEqual({ time: 1, state: '100', terminal: null });
    expect(vi.getTimerCount()).toBe(1);
    controller.play();
    vi.advanceTimersByTime(700);
    expect(controller.trajectory.time).toBe(2);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('cancels a pending update on Pause and resumes from the same trajectory', () => {
    const { controller, onPlaybackChange, onChange } = createController();
    controller.play();
    vi.advanceTimersByTime(700);
    const trajectory = controller.trajectory;
    controller.pause();
    controller.pause();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(7000);
    expect(trajectory.time).toBe(1);
    expect(onChange).toHaveBeenCalledTimes(2);
    controller.play();
    expect(controller.trajectory).toBe(trajectory);
    vi.advanceTimersByTime(700);
    expect(trajectory.time).toBe(2);
    expect(onPlaybackChange.mock.calls).toEqual([[true], [false], [true]]);
  });

  it('resets time, history, and visited states while cancelling playback', () => {
    const { controller, observed, onPlaybackChange } = createController();
    controller.play();
    vi.advanceTimersByTime(1400);
    const previous = controller.trajectory;
    controller.reset();
    expect(controller.trajectory).not.toBe(previous);
    expect(controller.trajectory.time).toBe(0);
    expect(controller.trajectory.currentState).toBe('000');
    expect(controller.trajectory.history).toEqual([{ time: 0, state: '000' }]);
    expect([...controller.trajectory.visited]).toEqual([['000', 0]]);
    expect(controller.trajectory.terminal).toBeNull();
    expect(controller.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(7000);
    expect(observed.at(-1)).toEqual({ time: 0, state: '000', terminal: null });
    expect(onPlaybackChange.mock.calls).toEqual([[true], [false]]);
  });

  it('accepts a new initial state and remembers it for later Reset calls', () => {
    const { controller } = createController();
    controller.reset('010');
    controller.step();
    expect(controller.trajectory.currentState).toBe('101');
    controller.reset();
    expect(controller.trajectory.currentState).toBe('010');
    expect(controller.trajectory.time).toBe(0);
    expect(controller.trajectory.terminal).toBeNull();
  });

  it('replacing the network discards the old timer and starts from the new configuration', () => {
    const { controller, observed } = createController();
    controller.play();
    vi.advanceTimersByTime(350);
    const replacement = new BooleanNetwork([{ name: 'X', expression: '!X' }]);
    controller.setNetwork(replacement, '1');
    expect(controller.network).toBe(replacement);
    expect(controller.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(7000);
    expect(observed.at(-1)).toEqual({ time: 0, state: '1', terminal: null });
    controller.play();
    vi.advanceTimersByTime(700);
    expect(observed.at(-1)).toEqual({ time: 1, state: '0', terminal: null });
    expect(vi.getTimerCount()).toBe(1);
  });

  it('changing speed replaces the pending timer and follows the new interval', () => {
    const { controller } = createController();
    controller.play();
    vi.advanceTimersByTime(300);
    controller.setSpeed(4);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(249);
    expect(controller.trajectory.time).toBe(0);
    vi.advanceTimersByTime(1);
    expect(controller.trajectory.time).toBe(1);
    controller.setSpeed(2);
    controller.setSpeed(5);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(199);
    expect(controller.trajectory.time).toBe(1);
    vi.advanceTimersByTime(1);
    expect(controller.trajectory.time).toBe(2);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('changing speed while paused creates no timer and applies on the next Play', () => {
    const { controller } = createController();
    controller.setSpeed(2);
    expect(vi.getTimerCount()).toBe(0);
    controller.play();
    vi.advanceTimersByTime(499);
    expect(controller.trajectory.time).toBe(0);
    vi.advanceTimersByTime(1);
    expect(controller.trajectory.time).toBe(1);
  });

  it.each([0, -1, NaN, Infinity, -Infinity, '2', null])('rejects invalid playback speed %j without disturbing playback', (speed) => {
    const { controller } = createController();
    controller.play();
    expect(() => controller.setSpeed(speed)).toThrow(/positive number/);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(700);
    expect(controller.trajectory.time).toBe(1);
  });

  it('advances manually while paused without starting playback', () => {
    const { controller, observed, onPlaybackChange } = createController();
    controller.step();
    controller.step();
    expect(observed.map(({ state }) => state)).toEqual(['000', '100', '110']);
    expect(controller.trajectory.time).toBe(2);
    expect(controller.playing).toBe(false);
    expect(onPlaybackChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('manual steps during playback retain one timer and cancel it upon termination', () => {
    const { controller, onPlaybackChange } = createController(makeExample('inverting-ring'), '010');
    controller.play();
    controller.step();
    expect(controller.trajectory.currentState).toBe('101');
    expect(vi.getTimerCount()).toBe(1);
    controller.step();
    expect(controller.trajectory.terminal).toMatchObject({ type: 'cycle', period: 2 });
    expect(controller.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(7000);
    expect(controller.trajectory.time).toBe(2);
    expect(onPlaybackChange.mock.calls).toEqual([[true], [false]]);
  });

  it('automatically reports and stops at an initially fixed configuration', () => {
    const { controller, observed, onPlaybackChange } = createController(makeExample('fixed-cascade'), '111');
    controller.play();
    vi.advanceTimersByTime(700);
    expect(observed.at(-1)).toEqual({
      time: 1,
      state: '111',
      terminal: { type: 'fixed', period: 1, states: ['111'], entryTime: 0 },
    });
    expect(controller.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(onPlaybackChange.mock.calls).toEqual([[true], [false]]);
  });

  it('automatically stops after convergence with an explicit fixed-point outcome', () => {
    const { controller, observed } = createController(makeExample('fixed-cascade'), '000');
    controller.play();
    vi.advanceTimersByTime(7000);
    expect(observed.map(({ state }) => state)).toEqual(['000', '100', '110', '111', '111']);
    expect(controller.trajectory.time).toBe(4);
    expect(controller.trajectory.terminal).toEqual({ type: 'fixed', period: 1, states: ['111'], entryTime: 3 });
    expect(controller.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('automatically stops at the first repeat of the initial state and reports the orbit', () => {
    const { controller, observed, onPlaybackChange } = createController();
    controller.play();
    vi.advanceTimersByTime(7000);
    expect(observed.map(({ state }) => state)).toEqual(['000', '100', '110', '111', '011', '001', '000']);
    expect(controller.trajectory.time).toBe(6);
    expect(controller.trajectory.terminal).toEqual({
      type: 'cycle', period: 6, states: ['000', '100', '110', '111', '011', '001'], entryTime: 0,
    });
    expect(controller.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(onPlaybackChange.mock.calls).toEqual([[true], [false]]);
  });

  it('automatically detects a repeated state reached after a transient', () => {
    const network = new BooleanNetwork([{ name: 'A', expression: '!A' }, { name: 'B', expression: 'A' }]);
    const { controller, observed } = createController(network, '00');
    controller.play();
    vi.advanceTimersByTime(7000);
    expect(observed.map(({ state }) => state)).toEqual(['00', '10', '01', '10']);
    expect(controller.trajectory.terminal).toEqual({ type: 'cycle', period: 2, states: ['10', '01'], entryTime: 1 });
    expect(controller.trajectory.time).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Play and Next Step do nothing after termination until Reset', () => {
    const { controller, onChange, onPlaybackChange } = createController(makeExample('inverting-ring'), '010');
    controller.step();
    controller.step();
    const terminal = controller.trajectory.terminal;
    controller.play();
    controller.step();
    controller.step();
    vi.advanceTimersByTime(7000);
    expect(controller.trajectory.time).toBe(2);
    expect(controller.trajectory.history).toHaveLength(3);
    expect(controller.trajectory.terminal).toBe(terminal);
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onPlaybackChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    controller.reset();
    controller.play();
    vi.advanceTimersByTime(700);
    expect(controller.trajectory.time).toBe(1);
    expect(controller.trajectory.terminal).toBeNull();
  });

  it('destroy cancels future callbacks and reports playback stopped exactly once', () => {
    const { controller, onChange, onPlaybackChange } = createController();
    controller.play();
    controller.destroy();
    controller.destroy();
    vi.advanceTimersByTime(7000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onPlaybackChange.mock.calls).toEqual([[true], [false]]);
    expect(controller.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('safely ignores Play and Next Step before a network is configured', () => {
    const onChange = vi.fn();
    const onPlaybackChange = vi.fn();
    const controller = new SimulationController({ onChange, onPlaybackChange });
    controller.play();
    controller.step();
    controller.pause();
    expect(onChange).not.toHaveBeenCalled();
    expect(onPlaybackChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('validates a reset configuration before replacing the existing trajectory', () => {
    const { controller, onChange } = createController();
    const trajectory = controller.trajectory;
    expect(() => controller.reset('12')).toThrow(/exactly 3 binary digits/);
    expect(controller.trajectory).toBe(trajectory);
    expect(controller.initialState).toBe('000');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
