/** Rotate an orbit into a deterministic order without changing its orientation. */
function canonicalOrbit(states) {
  const smallest = states.reduce((best, state, index) => state < states[best] ? index : best, 0);
  return [...states.slice(smallest), ...states.slice(0, smallest)];
}

/**
 * Analyze the entire functional graph in O(radix^n) walks after evaluating successors.
 * Depth is the number of transitions needed to first enter an attractor.
 * Basin sizes include both transient and attractor states.
 */
export function analyzePhaseSpace(network) {
  const radix = network.radix ?? 2;
  const stateCount = radix ** network.size;
  const states = Array.from({ length: stateCount }, (_, index) => {
    const state = index.toString(radix).padStart(network.size, '0');
    return {
      id: state,
      state,
      successor: network.nextState(state),
      attractorId: null,
      isAttractor: false,
      isFixedPoint: false,
      depth: null,
    };
  });
  const byState = new Map(states.map((state) => [state.state, state]));
  const attractors = [];

  for (const start of states) {
    if (start.attractorId !== null) continue;
    const path = [];
    const inPath = new Map();
    let current = start;
    while (current.attractorId === null && !inPath.has(current.state)) {
      inPath.set(current.state, path.length);
      path.push(current);
      current = byState.get(current.successor);
    }

    let transientCount = path.length;
    if (current.attractorId === null) {
      const cycleStart = inPath.get(current.state);
      const orbit = path.slice(cycleStart);
      const attractor = {
        id: `attractor-${attractors.length}`,
        type: orbit.length === 1 ? 'fixed' : 'cycle',
        states: canonicalOrbit(orbit.map((item) => item.state)),
        period: orbit.length,
        basinSize: orbit.length,
      };
      attractors.push(attractor);
      for (const item of orbit) {
        item.attractorId = attractor.id;
        item.isAttractor = true;
        item.isFixedPoint = orbit.length === 1;
        item.depth = 0;
      }
      transientCount = cycleStart;
    }

    // Work backwards: every successor has already acquired its basin and depth.
    for (let index = transientCount - 1; index >= 0; index -= 1) {
      const item = path[index];
      const successor = byState.get(item.successor);
      item.attractorId = successor.attractorId;
      item.depth = successor.depth + 1;
      const attractorIndex = Number(successor.attractorId.slice('attractor-'.length));
      attractors[attractorIndex].basinSize += 1;
    }
  }

  return {
    states,
    transitions: states.map(({ state, successor }) => ({ source: state, target: successor })),
    attractors,
    stateCount,
  };
}
