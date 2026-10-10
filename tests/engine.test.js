import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/examples.js';
import { BooleanNetwork, MAX_VARIABLES } from '../src/engine/network.js';
import { evaluateExpression, isVariableName, parseExpression } from '../src/engine/parser.js';
import { analyzePhaseSpace } from '../src/engine/phase-space.js';
import { Trajectory } from '../src/engine/trajectory.js';

const names = ['A', 'B', 'C'];
const evaluate = (expression, record) => evaluateExpression(parseExpression(expression, Object.keys(record)).ast, record);
const makeExample = (id) => new BooleanNetwork(EXAMPLES.find((example) => example.id === id).variables);

function runToTermination(network, state) {
  const trajectory = new Trajectory(network, state);
  for (let index = 0; index <= 2 ** network.size; index += 1) {
    if (trajectory.terminal) return trajectory;
    trajectory.step();
  }
  throw new Error('A finite deterministic Boolean trajectory must terminate within 2^n steps.');
}

describe('safe Boolean expression parser', () => {
  it.each([
    ['0', 0], ['1', 1], ['!0', 1], ['!1', 0], ['!!1', 1],
    ['1 && 0', 0], ['1 || 0', 1], ['1 ^ 1', 0], ['1 ^ 0', 1],
    ['(1 || 0) && !0', 1], ['! (1 && 0)', 1],
  ])('evaluates %s as %i', (expression, expected) => {
    expect(evaluate(expression, {})).toBe(expected);
  });

  it('applies NOT before AND before XOR before OR for every assignment', () => {
    for (let index = 0; index < 8; index += 1) {
      const [A, B, C] = index.toString(2).padStart(3, '0').split('').map(Number);
      expect(evaluate('!A && B ^ C || A', { A, B, C })).toBe(((1 - A) & B) ^ C | A);
      expect(evaluate('A || B ^ C && !A', { A, B, C })).toBe(A | (B ^ (C & (1 - A))));
    }
  });

  it('honors grouping and repeated NOT operators', () => {
    expect(evaluate('!(A || B) && !!C', { A: 0, B: 0, C: 1 })).toBe(1);
    expect(evaluate('(A || B) ^ (C && A)', { A: 1, B: 0, C: 1 })).toBe(0);
    expect(evaluate('1 ^ 1 ^ 1', {})).toBe(1);
  });

  it('supports meaningful names, whitespace, and case sensitivity', () => {
    const record = { gene_1: 1, _signal: 0, gene1: 0 };
    expect(evaluate(' \n gene_1\t && !_signal || gene1 ', record)).toBe(1);
    expect(() => parseExpression('a', ['A'])).toThrow(/Unknown variable "a"/);
  });

  it('extracts unique syntactic dependencies in source order', () => {
    expect(parseExpression('C && (A || !C) ^ B', names).dependencies).toEqual(['C', 'A', 'B']);
    expect(parseExpression('1 || 0', names).dependencies).toEqual([]);
    expect(parseExpression('A && 0', names).dependencies).toEqual(['A']);
  });

  it.each(['', ' ', 'A &&', '! ', '()', '(A || B', 'A)', 'A B', 'A & B', 'A | B', '2', '10', 'A = B'])('rejects malformed expression %j', (expression) => {
    expect(() => parseExpression(expression, names)).toThrow();
  });

  it('reports unknown variables and useful source positions', () => {
    expect(() => parseExpression('A && Missing', names)).toThrow(/Unknown variable "Missing".*column 6/);
    expect(() => parseExpression('(A', names)).toThrow(/closing parenthesis.*column 3/);
  });

  it.each(['A; alert(1)', 'globalThis.alert(1)', 'A[0]', 'A => B', '"1"', '`1`', 'function(){return 1}', 'A()'])('rejects JavaScript syntax %j', (expression) => {
    expect(() => parseExpression(expression, names)).toThrow();
  });

  it('rejects invalid types, excessive length, and excessive nesting', () => {
    expect(() => parseExpression(null, names)).toThrow(/must be a string/);
    expect(() => parseExpression('A'.repeat(4097), names)).toThrow(/at most 4096/);
    expect(() => parseExpression(`${'!'.repeat(257)}A`, names)).toThrow(/at most 256 levels/);
  });

  it('requires actual numeric state bits and own record properties', () => {
    const { ast } = parseExpression('A', ['A']);
    expect(() => evaluateExpression(ast, {})).toThrow(/Missing state value/);
    expect(() => evaluateExpression(ast, { A: 2 })).toThrow(/must be 0 or 1/);
    expect(() => evaluateExpression(ast, { A: '1' })).toThrow(/must be 0 or 1/);
    expect(() => evaluateExpression(ast, Object.create({ A: 1 }))).toThrow(/Missing state value/);
  });
});

describe('Boolean network representation and validation', () => {
  it('updates all variables synchronously from the previous state', () => {
    const network = new BooleanNetwork([{ name: 'A', expression: 'B' }, { name: 'B', expression: 'A' }]);
    expect(network.nextState('10')).toBe('01');
    expect(network.nextState('01')).toBe('10');
    expect(network.names).toEqual(['A', 'B']);
    expect(network.size).toBe(2);
  });

  it('keeps expressions, parsed trees, and wiring dependencies together', () => {
    const network = makeExample('inverting-ring');
    expect(network.variables.map(({ name, dependencies }) => ({ name, dependencies }))).toEqual([
      { name: 'A', dependencies: ['C'] },
      { name: 'B', dependencies: ['A'] },
      { name: 'C', dependencies: ['B'] },
    ]);
    expect(network.variables.every(({ expression, ast }) => typeof expression === 'string' && ast.type)).toBeTruthy();
  });

  it.each(['', '0', '0000', '0a0', '0 0', '012', '0\n0', 0, null])('rejects invalid state %j', (state) => {
    const network = makeExample('inverting-ring');
    expect(() => network.validateState(state)).toThrow(/exactly 3 binary digits/);
    expect(() => network.nextState(state)).toThrow();
  });

  it('preserves leading zero bits and left-to-right variable ordering', () => {
    const network = makeExample('inverting-ring');
    expect(network.validateState('001')).toBe('001');
    expect(network.nextState('001')).toBe('000');
  });

  it('rejects empty networks, duplicate names, invalid names, and invalid functions', () => {
    expect(() => new BooleanNetwork([])).toThrow(/between 1 and 8/);
    expect(() => new BooleanNetwork(null)).toThrow();
    expect(() => new BooleanNetwork([{ name: 'A', expression: '1' }, { name: 'A', expression: '0' }])).toThrow(/unique/);
    expect(() => new BooleanNetwork([{ name: '1A', expression: '0' }])).toThrow(/starting with a letter/);
    expect(() => new BooleanNetwork([null])).toThrow();
    expect(() => new BooleanNetwork([{ name: 'A', expression: 'B' }])).toThrow(/Update rule for A:.*Unknown variable/);
    expect(() => new BooleanNetwork([{ name: 'A' }])).toThrow(/Update rule for A/);
    expect(isVariableName('A_1')).toBe(true);
    expect(isVariableName('A-B')).toBe(false);
    expect(isVariableName('A\n')).toBe(false);
    expect(isVariableName(1)).toBe(false);
  });

  it('supports one through eight variables and rejects a ninth', () => {
    expect(new BooleanNetwork([{ name: 'A', expression: '!A' }]).nextState('0')).toBe('1');
    const definitions = Array.from({ length: MAX_VARIABLES }, (_, index) => ({ name: `X${index}`, expression: '1' }));
    expect(new BooleanNetwork(definitions).nextState('00000000')).toBe('11111111');
    expect(() => new BooleanNetwork([...definitions, { name: 'X8', expression: '1' }])).toThrow(/between 1 and 8/);
  });

  it('handles names that collide with object prototype properties safely', () => {
    const network = new BooleanNetwork([
      { name: '__proto__', expression: 'constructor' },
      { name: 'constructor', expression: '__proto__' },
    ]);
    expect(network.nextState('10')).toBe('01');
  });

  it('rejects final newline characters rather than treating them as binary digits', () => {
    const network = new BooleanNetwork([{ name: 'A', expression: 'A' }, { name: 'B', expression: 'B' }]);
    expect(() => network.validateState('0\n')).toThrow(/exactly 2 binary digits/);
    expect(() => new BooleanNetwork([{ name: 'A\n', expression: '1' }])).toThrow(/starting with a letter/);
  });
});

describe('complete phase space', () => {
  it('generates every state and exactly one outgoing transition per state', () => {
    const network = makeExample('inverting-ring');
    const phase = analyzePhaseSpace(network);
    expect(phase.stateCount).toBe(8);
    expect(phase.states.map(({ state }) => state)).toEqual(['000', '001', '010', '011', '100', '101', '110', '111']);
    expect(phase.transitions).toHaveLength(8);
    phase.states.forEach(({ id, state, successor }) => {
      expect(id).toBe(state);
      expect(successor).toBe(network.nextState(state));
      expect(phase.transitions.filter(({ source }) => source === state)).toEqual([{ source: state, target: successor }]);
    });
  });

  it('separates a fixed-point attractor from all its transient basin states', () => {
    const phase = analyzePhaseSpace(makeExample('fixed-cascade'));
    expect(phase.attractors).toEqual([{ id: 'attractor-0', type: 'fixed', states: ['111'], period: 1, basinSize: 8 }]);
    expect(phase.states.find(({ state }) => state === '000')).toMatchObject({ depth: 3, isAttractor: false, isFixedPoint: false });
    expect(phase.states.find(({ state }) => state === '111')).toMatchObject({ depth: 0, isAttractor: true, isFixedPoint: true });
  });

  it('finds canonical directed periodic orbits', () => {
    const phase = analyzePhaseSpace(makeExample('inverting-ring'));
    expect(phase.attractors.map(({ type, states, period, basinSize }) => ({ type, states, period, basinSize }))).toEqual([
      { type: 'cycle', states: ['000', '100', '110', '111', '011', '001'], period: 6, basinSize: 6 },
      { type: 'cycle', states: ['010', '101'], period: 2, basinSize: 2 },
    ]);
    expect(phase.states.every(({ isAttractor, isFixedPoint, depth }) => isAttractor && !isFixedPoint && depth === 0)).toBe(true);
  });

  it('classifies multiple attractors and nontrivial basins', () => {
    const phase = analyzePhaseSpace(makeExample('multiple-attractors'));
    expect(phase.attractors.map(({ type, states, basinSize }) => ({ type, states, basinSize }))).toEqual([
      { type: 'fixed', states: ['000'], basinSize: 4 },
      { type: 'fixed', states: ['100'], basinSize: 1 },
      { type: 'cycle', states: ['101', '110'], basinSize: 2 },
      { type: 'fixed', states: ['111'], basinSize: 1 },
    ]);
    expect(phase.states.find(({ state }) => state === '010').depth).toBe(2);
    expect(phase.states.find(({ state }) => state === '011').depth).toBe(2);
    expect(phase.attractors.reduce((sum, { basinSize }) => sum + basinSize, 0)).toBe(phase.stateCount);
  });

  it('handles a constant zero network and independent identity variables', () => {
    const constant = analyzePhaseSpace(new BooleanNetwork([{ name: 'A', expression: '0' }, { name: 'B', expression: '0' }]));
    expect(constant.attractors).toHaveLength(1);
    expect(constant.attractors[0]).toMatchObject({ states: ['00'], basinSize: 4, type: 'fixed' });
    const identity = analyzePhaseSpace(new BooleanNetwork([{ name: 'A', expression: 'A' }, { name: 'B', expression: 'B' }]));
    expect(identity.attractors).toHaveLength(4);
    expect(identity.states.every(({ isFixedPoint, depth }) => isFixedPoint && depth === 0)).toBe(true);
  });

  it('analyzes the full supported 256-state network consistently', () => {
    const network = new BooleanNetwork(Array.from({ length: 8 }, (_, index) => ({ name: `X${index}`, expression: index === 0 ? '!X7' : `X${index - 1}` })));
    const phase = analyzePhaseSpace(network);
    expect(phase.states).toHaveLength(256);
    expect(phase.transitions).toHaveLength(256);
    expect(phase.attractors.reduce((sum, { basinSize }) => sum + basinSize, 0)).toBe(256);
    phase.attractors.forEach(({ states, period }) => {
      expect(states).toHaveLength(period);
      states.forEach((state, index) => expect(network.nextState(state)).toBe(states[(index + 1) % period]));
    });
  });
});

describe('trajectory terminal detection', () => {
  it('detects an initially fixed state explicitly on its first update', () => {
    const trajectory = new Trajectory(makeExample('fixed-cascade'), '111');
    expect(trajectory.terminal).toBeNull();
    expect(trajectory.step()).toBe('111');
    expect(trajectory.time).toBe(1);
    expect(trajectory.terminal).toEqual({ type: 'fixed', period: 1, states: ['111'], entryTime: 0 });
  });

  it('detects fixed convergence and records the repeated terminal state', () => {
    const trajectory = runToTermination(makeExample('fixed-cascade'), '000');
    expect(trajectory.history).toEqual([
      { time: 0, state: '000' }, { time: 1, state: '100' },
      { time: 2, state: '110' }, { time: 3, state: '111' }, { time: 4, state: '111' },
    ]);
    expect(trajectory.terminal).toEqual({ type: 'fixed', period: 1, states: ['111'], entryTime: 3 });
  });

  it('stops when the initial configuration is first repeated', () => {
    const trajectory = runToTermination(makeExample('inverting-ring'), '000');
    expect(trajectory.time).toBe(6);
    expect(trajectory.currentState).toBe('000');
    expect(trajectory.terminal).toEqual({ type: 'cycle', period: 6, states: ['000', '100', '110', '111', '011', '001'], entryTime: 0 });
    expect(trajectory.history).toHaveLength(7);
  });

  it('correctly calculates cycle entry time after a transient', () => {
    const network = new BooleanNetwork([{ name: 'A', expression: '!A' }, { name: 'B', expression: 'A' }]);
    const trajectory = runToTermination(network, '00');
    expect(trajectory.history.map(({ state }) => state)).toEqual(['00', '10', '01', '10']);
    expect(trajectory.terminal).toEqual({ type: 'cycle', period: 2, states: ['10', '01'], entryTime: 1 });
  });

  it('cannot advance beyond a terminal state', () => {
    const trajectory = runToTermination(makeExample('inverting-ring'), '010');
    const historyLength = trajectory.history.length;
    const time = trajectory.time;
    const terminal = trajectory.terminal;
    expect(trajectory.step()).toBe('010');
    expect(trajectory.step()).toBe('010');
    expect(trajectory.history).toHaveLength(historyLength);
    expect(trajectory.time).toBe(time);
    expect(trajectory.terminal).toBe(terminal);
  });

  it('rejects an invalid initial state', () => {
    expect(() => new Trajectory(makeExample('inverting-ring'), '12')).toThrow(/exactly 3 binary digits/);
  });

  it.each(EXAMPLES.map((example) => [example.name, example]))('matches phase-space classification from every state of %s', (_, example) => {
    const network = new BooleanNetwork(example.variables);
    const phase = analyzePhaseSpace(network);
    phase.states.forEach((state) => {
      const trajectory = runToTermination(network, state.state);
      const uniqueStates = trajectory.history.slice(0, -1).map(({ state: item }) => item);
      // Only the final entry repeats; no configuration was skipped or repeated earlier.
      expect(new Set(uniqueStates).size).toBe(uniqueStates.length);
      expect(uniqueStates).toContain(trajectory.currentState);
      expect(trajectory.time).toBe(trajectory.history.length - 1);
      expect(trajectory.time).toBeLessThanOrEqual(phase.stateCount);
      const attractor = phase.attractors.find(({ id }) => id === state.attractorId);
      expect(trajectory.terminal.type).toBe(attractor.type);
      expect(trajectory.terminal.period).toBe(attractor.period);
      expect([...trajectory.terminal.states].sort()).toEqual([...attractor.states].sort());
      expect(trajectory.terminal.entryTime).toBe(state.depth);
    });
  });
});
