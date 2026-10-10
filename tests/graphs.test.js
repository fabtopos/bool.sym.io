import { afterEach, describe, expect, it, vi } from 'vitest';
import cytoscape from 'cytoscape';
import { EXAMPLES } from '../src/examples.js';
import { BooleanNetwork } from '../src/engine/network.js';
import { analyzePhaseSpace } from '../src/engine/phase-space.js';
import { layoutPhaseSpace, PhaseGraph } from '../src/graphs/phase-graph.js';
import { WiringGraph } from '../src/graphs/wiring-graph.js';

// Use Cytoscape's real graph and stylesheet APIs without requiring a canvas or
// a browser. Enabling styles also validates the properties used by the views.
vi.mock('cytoscape', async (importOriginal) => {
  const { default: create } = await importOriginal();
  return {
    default: vi.fn((options) => create({ ...options, container: undefined, headless: true, styleEnabled: true })),
  };
});

const graphs = [];
function graphOf(Type) {
  const graph = new Type(undefined);
  graphs.push(graph);
  return graph;
}

afterEach(() => {
  graphs.splice(0).forEach((graph) => graph.destroy());
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const definitions = (expressionFor) => Array.from({ length: 8 }, (_, index) => ({
  name: `X${index}`, expression: expressionFor(index),
}));

describe('deterministic functional graph layout', () => {
  const cases = [
    ...EXAMPLES.map((example) => [example.name, example.variables]),
    ['256 fixed points', definitions((index) => `X${index}`)],
    ['a broad fixed-point basin', definitions(() => '0')],
    ['a deep fixed-point basin', definitions((index) => index === 0 ? '1' : `X${index - 1}`)],
    ['a periodic orbit with deep incoming trees', definitions((index) => index === 0 ? '!X0' : `X${index - 1}`)],
    ['many periodic components', definitions((index) => index === 0 ? '!X7' : `X${index - 1}`)],
  ];

  it.each(cases)('places every state of %s without overlapping labels', (_, variables) => {
    const network = new BooleanNetwork(variables);
    const analysis = analyzePhaseSpace(network);
    const nodeSize = Math.max(44, network.size * 7.3 + 16);
    const positions = layoutPhaseSpace(analysis, nodeSize);
    expect(positions.size).toBe(analysis.stateCount);
    expect([...positions.keys()].sort()).toEqual(analysis.states.map(({ state }) => state).sort());
    expect([...positions]).toEqual([...layoutPhaseSpace(analysis, nodeSize)]);
    const points = [...positions.values()];
    points.forEach(({ x, y }) => {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    });
    let closest = Infinity;
    for (let first = 0; first < points.length; first += 1) {
      for (let second = first + 1; second < points.length; second += 1) {
        closest = Math.min(closest, Math.hypot(points[first].x - points[second].x, points[first].y - points[second].y));
      }
    }
    expect(closest).toBeGreaterThan(nodeSize + 10);
  });

  it('preserves analysis data when computing display coordinates', () => {
    const analysis = analyzePhaseSpace(new BooleanNetwork(EXAMPLES[0].variables));
    const before = structuredClone(analysis);
    layoutPhaseSpace(analysis);
    expect(analysis).toEqual(before);
  });
});

describe('static phase graph rendering', () => {
  it('renders exactly the analyzed transitions and independently styles attractors', () => {
    const network = new BooleanNetwork(EXAMPLES.find(({ id }) => id === 'multiple-attractors').variables);
    const analysis = analyzePhaseSpace(network);
    const graph = graphOf(PhaseGraph);
    graph.setNetwork(network, analysis);
    expect(graph.cy.nodes()).toHaveLength(8);
    expect(graph.cy.edges()).toHaveLength(8);
    for (const state of analysis.states) {
      const node = graph.cy.getElementById(state.state);
      expect(node.data('label')).toBe(state.state);
      expect(node.locked()).toBe(true);
      expect(node.hasClass(state.isFixedPoint ? 'fixed' : state.isAttractor ? 'cycle' : 'transient')).toBe(true);
      expect(node.outgoers('edge')[0].target().id()).toBe(state.successor);
    }
    // There is deliberately no state-update method on the phase view.
    expect(graph.setState).toBeUndefined();
  });
});

describe('wiring graph rendering and updates', () => {
  it('extracts directed dependencies once and updates values without rebuilding or moving nodes', () => {
    const network = new BooleanNetwork([
      { name: 'A', expression: '!B || B' },
      { name: 'B', expression: 'A && C' },
      { name: 'C', expression: 'C' },
    ]);
    const graph = graphOf(WiringGraph);
    graph.setNetwork(network, '010');
    expect(graph.cy.edges().map((edge) => [edge.source().data('name'), edge.target().data('name')])).toEqual([
      ['B', 'A'], ['A', 'B'], ['C', 'B'], ['C', 'C'],
    ]);
    const nodes = graph.cy.nodes().toArray();
    const edges = graph.cy.edges().toArray();
    graph.cy.getElementById('variable-0').position({ x: 380, y: 240 });
    const positions = nodes.map((node) => ({ ...node.position() }));
    graph.setState('101');
    expect(graph.cy.nodes().toArray()).toEqual(nodes);
    expect(graph.cy.edges().toArray()).toEqual(edges);
    expect(nodes.map((node) => node.position())).toEqual(positions);
    expect(nodes.map((node) => node.data('value'))).toEqual([1, 0, 1]);
    expect(nodes.map((node) => node.data('label'))).toEqual(['A\n1', 'B\n0', 'C\n1']);
    expect(nodes.map((node) => node.classes())).toEqual([['on'], ['off'], ['on']]);
  });

  it('rejects incomplete or invalid wiring states before changing the graph', () => {
    const graph = graphOf(WiringGraph);
    const network = new BooleanNetwork(EXAMPLES[0].variables);
    graph.setNetwork(network, '000');
    const before = graph.cy.nodes().map((node) => node.data('value'));
    for (const state of ['00', '012', '000\n', null, [0, 1, 2]]) {
      expect(() => graph.setState(state)).toThrow(/exactly 3 Boolean values/);
      expect(graph.cy.nodes().map((node) => node.data('value'))).toEqual(before);
    }
    graph.setState([1, 0, 1]);
    expect(graph.cy.nodes().map((node) => node.data('value'))).toEqual([1, 0, 1]);
  });

  it('wraps complete long names inside the node label', () => {
    const name = 'A_variable_name_that_remains_readable_across_multiple_lines';
    const graph = graphOf(WiringGraph);
    graph.setNetwork(new BooleanNetwork([{ name, expression: '1' }]), '0');
    const node = graph.cy.nodes()[0];
    expect(node.data('label')).toBe(`${name}\n0`);
    expect(node.style('text-wrap')).toBe('wrap');
    expect(node.style('text-overflow-wrap')).toBe('anywhere');
    expect(node.data('labelWidth')).toBeLessThan(node.data('size'));
  });

  it('honors reduced motion initially and when the system setting changes', () => {
    const preference = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => preference));
    const graph = graphOf(WiringGraph);
    const options = cytoscape.mock.calls.at(-1)[0];
    expect(globalThis.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(options.style[0].style['transition-duration']).toBe('0ms');
    expect(preference.addEventListener).toHaveBeenCalledWith('change', graph.onMotionChange);
    graph.setNetwork(new BooleanNetwork([{ name: 'A', expression: '!A' }]), '0');
    preference.matches = false;
    graph.onMotionChange();
    expect(graph.cy.nodes()[0].style('transition-duration')).toBe('180ms');
    preference.matches = true;
    graph.onMotionChange();
    expect(graph.cy.nodes()[0].style('transition-duration')).toBe('0ms');
    graph.destroy();
    graphs.pop();
    expect(preference.removeEventListener).toHaveBeenCalledWith('change', graph.onMotionChange);
  });

  it('bounds unusually long canvas labels while preserving full identifier data', () => {
    const name = `Gene_${'A'.repeat(500)}`;
    const graph = graphOf(WiringGraph);
    graph.setNetwork(new BooleanNetwork([{ name, expression: '1' }]), '0');
    const node = graph.cy.nodes()[0];
    expect(node.data('name')).toBe(name);
    expect(node.data('displayName')).toBe(`${name.slice(0, 61)}…`);
    graph.setState('1');
    expect(node.data('name')).toBe(name);
    expect(node.data('label')).toBe(`${name.slice(0, 61)}…\n1`);
  });
});
