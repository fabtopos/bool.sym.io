import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BooleanNetwork } from '../src/engine/network.js';
import { analyzePhaseSpace } from '../src/engine/phase-space.js';
import { TernaryNetwork, MAX_TERNARY_VARIABLES } from '../src/engine/ternary-network.js';
import { evaluateTernaryExpression, parseTernaryExpression } from '../src/engine/ternary-parser.js';
import { Trajectory } from '../src/engine/trajectory.js';
import { SimulationController } from '../src/simulation/controller.js';
import { TERNARY_EXAMPLES } from '../src/ternary-examples.js';

const evaluate = (expression, record = {}) => evaluateTernaryExpression(parseTernaryExpression(expression, Object.keys(record)).ast, record);
const makeExample = (id) => new TernaryNetwork(TERNARY_EXAMPLES.find((example) => example.id === id).variables);

function runToTermination(network, state) {
  const trajectory = new Trajectory(network, state);
  for (let index = 0; index <= network.radix ** network.size; index += 1) {
    if (trajectory.terminal) return trajectory;
    trajectory.step();
  }
  throw new Error('A finite deterministic trajectory must terminate within radix^n updates.');
}

describe('safe three-state expression parser', () => {
  it.each([
    ['0', 0], ['1', 1], ['2', 2], ['+2', 2], ['-0', 0], ['-1', 2], ['-2', 1], ['--2', 2],
    ['2 + 1', 0], ['2 + 2', 1], ['0 - 1', 2], ['1 - 2', 2], ['2 * 2', 1],
    ['inc(0)', 1], ['inc(1)', 2], ['inc(2)', 0],
    ['dec(0)', 2], ['dec(1)', 0], ['dec(2)', 1],
    ['inc(2 + 0)', 0], ['inc(dec(-1))', 2], ['-inc(0)', 2],
    ['(2 + 0) * -1', 1], ['- (2 * 1)', 1],
  ])('evaluates %s as %i', (expression, expected) => {
    expect(evaluate(expression)).toBe(expected);
  });

  it('implements addition, subtraction, and multiplication for all nine input combinations', () => {
    for (let A = 0; A < 3; A += 1) {
      for (let B = 0; B < 3; B += 1) {
        expect(evaluate('A + B', { A, B })).toBe((A + B) % 3);
        expect(evaluate('A - B', { A, B })).toBe((A - B + 3) % 3);
        expect(evaluate('A * B', { A, B })).toBe((A * B) % 3);
      }
    }
  });

  it('applies unary signs before multiplication before addition/subtraction for all 27 assignments', () => {
    for (let index = 0; index < 27; index += 1) {
      const [A, B, C] = index.toString(3).padStart(3, '0').split('').map(Number);
      expect(evaluate('-A * B + C - A', { A, B, C })).toBe(((-A * B + C - A) % 3 + 3) % 3);
      expect(evaluate('A + B * C - -A', { A, B, C })).toBe((A + B * C + A) % 3);
    }
  });

  it('honors grouping and left associativity of addition/subtraction', () => {
    expect(evaluate('2 - 1 - 1')).toBe(0);
    expect(evaluate('2 - (1 - 1)')).toBe(2);
    expect(evaluate('2 - 1 + 1')).toBe(2);
    expect(evaluate('-(A + B) * --C', { A: 0, B: 1, C: 2 })).toBe(1);
  });

  it('keeps negative arithmetic and long multiplication chains within the finite field', () => {
    expect(evaluate('-2 * -2 + -1')).toBe(0);
    expect(evaluate('0 - 2 - 2')).toBe(2);
    // Reducing after each multiplication avoids losing precision or overflowing.
    expect(evaluate(Array(1000).fill('2').join(' * '))).toBe(1);
  });

  it('collects unique syntactic dependencies including operands of functions', () => {
    expect(parseTernaryExpression('inc(C) * (A + -C) - dec(B)', ['A', 'B', 'C']).dependencies).toEqual(['C', 'A', 'B']);
    expect(parseTernaryExpression('inc(2) + 0', ['A']).dependencies).toEqual([]);
    expect(parseTernaryExpression('A * 0', ['A']).dependencies).toEqual(['A']);
  });

  it('distinguishes bare variable names inc/dec from function calls', () => {
    expect(evaluate('inc + dec', { inc: 2, dec: 1 })).toBe(0);
    expect(evaluate('inc(inc) + dec(dec)', { inc: 2, dec: 1 })).toBe(0);
    expect(parseTernaryExpression('inc(2)', ['inc']).dependencies).toEqual([]);
    expect(parseTernaryExpression('inc ( A )', ['A']).dependencies).toEqual(['A']);
  });

  it('supports whitespace, meaningful names, case sensitivity, and source columns', () => {
    expect(evaluate(' \n gene_1\t * -_signal + gene1 ', { gene_1: 2, _signal: 0, gene1: 1 })).toBe(1);
    expect(() => parseTernaryExpression('a', ['A'])).toThrow(/Unknown variable "a"/);
    expect(() => parseTernaryExpression('A + Missing', ['A'])).toThrow(/Unknown variable "Missing".*column 5/);
    expect(() => parseTernaryExpression('inc(A', ['A'])).toThrow(/closing parenthesis.*column 6/);
  });

  it.each(['', ' ', 'A +', '-', '()', '(A', 'A)', 'A B', 'A / 2', 'A % 2', 'A ** 2', '3', '12', 'A = 2', 'inc()', 'inc(A, 1)', 'inc(A B)', 'inc(A))', 'INC(A)', 'max(A)', 'A()'])('rejects malformed expression %j', (expression) => {
    expect(() => parseTernaryExpression(expression, ['A'])).toThrow();
  });

  it.each(['!A', 'A && 2', 'A || 2', 'A ^ 2'])('explains unsupported Boolean syntax %j', (expression) => {
    expect(() => parseTernaryExpression(expression, ['A'])).toThrow(/Boolean operators are not supported.*modulo 3/);
  });

  it.each(['A; alert(1)', 'globalThis.alert(1)', 'A[0]', 'A => 2', '"2"', '`2`', 'function(){return 2}', 'Math.max(A,2)'])('rejects JavaScript syntax %j', (expression) => {
    expect(() => parseTernaryExpression(expression, ['A'])).toThrow();
  });

  it('limits source length and nesting including function calls', () => {
    expect(() => parseTernaryExpression(null, ['A'])).toThrow(/must be a string/);
    expect(() => parseTernaryExpression('A'.repeat(4097), ['A'])).toThrow(/at most 4096/);
    expect(() => parseTernaryExpression(`${'-'.repeat(257)}A`, ['A'])).toThrow(/at most 256 levels/);
    expect(() => parseTernaryExpression(`${'inc('.repeat(257)}A${')'.repeat(257)}`, ['A'])).toThrow(/at most 256 levels/);
  });

  it('requires numeric values 0 through 2 and own record properties', () => {
    const { ast } = parseTernaryExpression('A', ['A']);
    expect(() => evaluateTernaryExpression(ast, {})).toThrow(/Missing state value/);
    for (const value of [-1, 3, '1', 1.5, NaN, true, null]) {
      expect(() => evaluateTernaryExpression(ast, { A: value })).toThrow(/must be 0, 1 or 2/);
    }
    expect(() => evaluateTernaryExpression(ast, Object.create({ A: 2 }))).toThrow(/Missing state value/);
    expect(() => evaluateTernaryExpression({ type: 'arbitrary' }, {})).toThrow(/Invalid three-state/);
  });
});

describe('three-state network representation', () => {
  it('evaluates every update against the same previous configuration', () => {
    const network = new TernaryNetwork([{ name: 'A', expression: 'B' }, { name: 'B', expression: 'A' }]);
    expect(network.nextState('21')).toBe('12');
    expect(network.nextState('12')).toBe('21');
    expect(network.names).toEqual(['A', 'B']);
    expect(network.size).toBe(2);
    expect(network.radix).toBe(3);
    expect(network.maxVariables).toBe(5);
  });

  it('keeps expression trees and dependencies in immutable network records', () => {
    const network = makeExample('ternary-cycle');
    expect(network.variables.map(({ name, dependencies }) => ({ name, dependencies }))).toEqual([
      { name: 'A', dependencies: ['A'] }, { name: 'B', dependencies: ['A'] },
    ]);
    expect(Object.isFrozen(network.names)).toBe(true);
    expect(Object.isFrozen(network.variables)).toBe(true);
    expect(network.variables.every((variable) => Object.isFrozen(variable) && Object.isFrozen(variable.dependencies))).toBe(true);
  });

  it.each(['', '0', '0000', '0a0', '0 0', '013', '0\n0', 0, null, [0, 1, 2]])('rejects invalid ternary state %j', (state) => {
    const network = makeExample('ternary-cascade');
    expect(() => network.validateState(state)).toThrow(/exactly 3 ternary digits/);
    expect(() => network.nextState(state)).toThrow();
  });

  it('preserves leading zeros and variable ordering', () => {
    const network = makeExample('ternary-cycle');
    expect(network.validateState('02')).toBe('02');
    expect(network.nextState('02')).toBe('10');
  });

  it('rejects empty networks, duplicate or invalid names, and malformed update rules', () => {
    expect(() => new TernaryNetwork([])).toThrow(/between 1 and 5/);
    expect(() => new TernaryNetwork(null)).toThrow();
    expect(() => new TernaryNetwork([null])).toThrow();
    expect(() => new TernaryNetwork([{ name: 'A', expression: '2' }, { name: 'A', expression: '0' }])).toThrow(/unique/);
    expect(() => new TernaryNetwork([{ name: '1A', expression: '0' }])).toThrow(/starting with a letter/);
    expect(() => new TernaryNetwork([{ name: 'A\n', expression: '2' }])).toThrow(/starting with a letter/);
    expect(() => new TernaryNetwork([{ name: 'A', expression: 'Missing' }])).toThrow(/Update rule for A:.*Unknown variable/);
    expect(() => new TernaryNetwork([{ name: 'A' }])).toThrow(/Update rule for A:.*must be a string/);
  });

  it('supports one through five variables and rejects a sixth with the phase-space limit', () => {
    expect(new TernaryNetwork([{ name: 'A', expression: 'inc(A)' }]).nextState('2')).toBe('0');
    const definitions = Array.from({ length: MAX_TERNARY_VARIABLES }, (_, index) => ({ name: `X${index}`, expression: '2' }));
    expect(new TernaryNetwork(definitions).nextState('00000')).toBe('22222');
    expect(() => new TernaryNetwork([...definitions, { name: 'X5', expression: '2' }])).toThrow(/between 1 and 5.*243/);
  });

  it('handles names that collide with object prototypes or function names safely', () => {
    const network = new TernaryNetwork([
      { name: '__proto__', expression: 'constructor' },
      { name: 'constructor', expression: '__proto__' },
      { name: 'inc', expression: 'inc(inc)' },
    ]);
    expect(network.nextState('210')).toBe('121');
  });

  it('leaves the Boolean module radix, limits, and logic consistent', () => {
    const network = new BooleanNetwork([{ name: 'A', expression: '!A' }]);
    expect(network.radix).toBe(2);
    expect(network.maxVariables).toBe(8);
    expect(network.nextState('1')).toBe('0');
    expect(analyzePhaseSpace(network).states.map(({ state }) => state)).toEqual(['0', '1']);
  });
});

describe('complete three-state phase space and trajectories', () => {
  it('enumerates all ternary configurations and exactly one correct successor per state', () => {
    const network = makeExample('ternary-cycle');
    const phase = analyzePhaseSpace(network);
    expect(phase.stateCount).toBe(9);
    expect(phase.states.map(({ state }) => state)).toEqual(['00', '01', '02', '10', '11', '12', '20', '21', '22']);
    expect(phase.transitions).toHaveLength(9);
    phase.states.forEach(({ state, successor }) => {
      expect(successor).toBe(network.nextState(state));
      expect(phase.transitions.filter(({ source }) => source === state)).toEqual([{ source: state, target: successor }]);
    });
  });

  it('finds the default period-3 clock and its full nine-state basin', () => {
    const phase = analyzePhaseSpace(makeExample('ternary-cycle'));
    expect(phase.attractors).toEqual([{ id: 'attractor-0', type: 'cycle', states: ['02', '10', '21'], period: 3, basinSize: 9 }]);
    expect(phase.states.find(({ state }) => state === '00')).toMatchObject({ depth: 1, isAttractor: false });
    expect(phase.states.filter(({ isAttractor }) => isAttractor).map(({ state }) => state)).toEqual(['02', '10', '21']);
  });

  it('reports convergence as a fixed point and counts transient depths', () => {
    const network = makeExample('ternary-cascade');
    const phase = analyzePhaseSpace(network);
    expect(phase.attractors).toEqual([{ id: 'attractor-0', type: 'fixed', states: ['222'], period: 1, basinSize: 27 }]);
    expect(phase.states.find(({ state }) => state === '000')).toMatchObject({ depth: 3, isAttractor: false, isFixedPoint: false });
    expect(phase.states.find(({ state }) => state === '222')).toMatchObject({ depth: 0, isAttractor: true, isFixedPoint: true });
    const trajectory = runToTermination(network, '000');
    expect(trajectory.history.map(({ state }) => state)).toEqual(['000', '200', '220', '222', '222']);
    expect(trajectory.terminal).toEqual({ type: 'fixed', period: 1, states: ['222'], entryTime: 3 });
  });

  it('finds multiple fixed and periodic attractors with nontrivial basins', () => {
    const phase = analyzePhaseSpace(makeExample('ternary-multiple'));
    expect(phase.attractors.map(({ type, states, basinSize }) => ({ type, states, basinSize }))).toEqual([
      { type: 'fixed', states: ['00'], basinSize: 3 },
      { type: 'fixed', states: ['10'], basinSize: 1 },
      { type: 'fixed', states: ['11'], basinSize: 1 },
      { type: 'fixed', states: ['12'], basinSize: 1 },
      { type: 'fixed', states: ['20'], basinSize: 1 },
      { type: 'cycle', states: ['21', '22'], basinSize: 2 },
    ]);
    expect(phase.states.find(({ state }) => state === '02').depth).toBe(1);
    expect(phase.attractors.reduce((sum, { basinSize }) => sum + basinSize, 0)).toBe(9);
  });

  it('stops at the first repeated initial state, not one period later', () => {
    const network = new TernaryNetwork([{ name: 'A', expression: 'inc(A)' }]);
    const trajectory = runToTermination(network, '0');
    expect(trajectory.history.map(({ state }) => state)).toEqual(['0', '1', '2', '0']);
    expect(trajectory.time).toBe(3);
    expect(trajectory.terminal).toEqual({ type: 'cycle', period: 3, states: ['0', '1', '2'], entryTime: 0 });
    expect(trajectory.step()).toBe('0');
    expect(trajectory.history).toHaveLength(4);
  });

  it('calculates orbit entry and period after a transient', () => {
    const trajectory = runToTermination(makeExample('ternary-cycle'), '00');
    expect(trajectory.history.map(({ state }) => state)).toEqual(['00', '10', '21', '02', '10']);
    expect(trajectory.terminal).toEqual({ type: 'cycle', period: 3, states: ['10', '21', '02'], entryTime: 1 });
  });

  it('recognizes an initially fixed value without classifying it as a periodic orbit', () => {
    const trajectory = new Trajectory(new TernaryNetwork([{ name: 'A', expression: '2 - A' }]), '1');
    trajectory.step();
    expect(trajectory.terminal).toEqual({ type: 'fixed', period: 1, states: ['1'], entryTime: 0 });
    expect(analyzePhaseSpace(trajectory.network).attractors.map(({ type, states }) => ({ type, states }))).toEqual([
      { type: 'cycle', states: ['0', '2'] }, { type: 'fixed', states: ['1'] },
    ]);
  });

  it('analyzes all 243 states at the supported limit and verifies every attractor transition', () => {
    const network = new TernaryNetwork(Array.from({ length: 5 }, (_, index) => ({
      name: `X${index}`, expression: index === 0 ? 'inc(X4)' : `X${index - 1}`,
    })));
    const phase = analyzePhaseSpace(network);
    expect(phase.states).toHaveLength(243);
    expect(phase.transitions).toHaveLength(243);
    expect(phase.attractors.reduce((sum, { basinSize }) => sum + basinSize, 0)).toBe(243);
    phase.attractors.forEach(({ states, period }) => {
      expect(states).toHaveLength(period);
      states.forEach((state, index) => expect(network.nextState(state)).toBe(states[(index + 1) % period]));
    });
  });

  it.each(TERNARY_EXAMPLES.map((example) => [example.name, example]))('matches phase-space classification from every configuration of %s', (_, example) => {
    const network = new TernaryNetwork(example.variables);
    const phase = analyzePhaseSpace(network);
    phase.states.forEach((state) => {
      const trajectory = runToTermination(network, state.state);
      const uniqueStates = trajectory.history.slice(0, -1).map(({ state: item }) => item);
      expect(new Set(uniqueStates).size).toBe(uniqueStates.length);
      expect(uniqueStates).toContain(trajectory.currentState);
      expect(trajectory.time).toBeLessThanOrEqual(phase.stateCount);
      const attractor = phase.attractors.find(({ id }) => id === state.attractorId);
      expect(trajectory.terminal.type).toBe(attractor.type);
      expect(trajectory.terminal.period).toBe(attractor.period);
      expect([...trajectory.terminal.states].sort()).toEqual([...attractor.states].sort());
      expect(trajectory.terminal.entryTime).toBe(state.depth);
    });
  });
});

describe('three-state automatic playback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('advances through all three values and cancels its timer at the first repeated state', () => {
    const observed = [];
    const controller = new SimulationController({ onChange: (trajectory) => observed.push(trajectory.currentState) });
    controller.setNetwork(new TernaryNetwork([{ name: 'A', expression: 'inc(A)' }]), '0');
    controller.play();
    controller.play();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(7000);
    expect(observed).toEqual(['0', '1', '2', '0']);
    expect(controller.trajectory.terminal).toMatchObject({ type: 'cycle', period: 3 });
    expect(controller.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('switching modules stops the old playback and starts a valid fresh trajectory', () => {
    const controller = new SimulationController();
    controller.setNetwork(new BooleanNetwork([{ name: 'A', expression: '!A' }]), '0');
    controller.play();
    controller.setNetwork(new TernaryNetwork([{ name: 'A', expression: '2 - A' }]), '1');
    expect(controller.playing).toBe(false);
    expect(controller.trajectory.currentState).toBe('1');
    expect(controller.trajectory.time).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    controller.play();
    vi.advanceTimersByTime(700);
    expect(controller.trajectory.terminal).toMatchObject({ type: 'fixed', states: ['1'] });
    expect(vi.getTimerCount()).toBe(0);
  });
});
