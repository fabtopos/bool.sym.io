import cytoscape from 'cytoscape';

const TAU = 2 * Math.PI;
const PALETTE = {
  ink: '#263b4e',
  transient: '#e9f0f6',
  transientBorder: '#91a8bd',
  edge: '#a0b1c1',
  fixed: '#fff0c8',
  fixedBorder: '#b67b12',
  cycle: '#eee6ff',
  cycleBorder: '#825ac0',
};

/**
 * A functional graph consists of one directed cycle per basin, with trees
 * feeding into that cycle. Put each periodic orbit in the middle of its basin,
 * with trees on ordered concentric layers. A fixed point uses a compact rooted
 * tree instead. No force simulation is needed.
 *
 * Ordering children by their parent keeps the incoming trees together. Layer
 * radii account for both node labels and the number of states on each layer.
 * Packing separate basins into rows prevents components from overlapping.
 */
export function layoutPhaseSpace(analysis, nodeSize = 56) {
  const positions = new Map();
  const byState = new Map(analysis.states.map((state) => [state.state, state]));
  const children = new Map(analysis.states.map((state) => [state.state, []]));

  for (const state of analysis.states) {
    if (!state.isAttractor) children.get(state.successor)?.push(state.state);
  }
  for (const incoming of children.values()) incoming.sort();

  const gap = nodeSize + 30;
  const components = analysis.attractors.map((attractor) => {
    const local = new Map();
    const orbit = attractor.states;
    const orbitRadius = orbit.length === 1 ? 0 : Math.max(75, (gap * orbit.length) / TAU);
    let radius = orbitRadius;

    orbit.forEach((state, index) => {
      const angle = -Math.PI / 2 + (TAU * index) / orbit.length;
      local.set(state, { x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
    });

    let parents = [...orbit];
    let depth = 0;
    if (orbit.length === 1) {
      // Leaf intervals yield a tidy tree: siblings never overlap and each
      // parent sits over the span occupied by its incoming subtree.
      const leafCounts = new Map();
      const countLeaves = (state) => {
        const incoming = children.get(state);
        const count = incoming.length ? incoming.reduce((sum, child) => sum + countLeaves(child), 0) : 1;
        leafCounts.set(state, count);
        return count;
      };
      const placeTree = (state, start, level) => {
        local.set(state, { x: (start + leafCounts.get(state) / 2) * gap, y: level * gap });
        let nextStart = start;
        for (const child of children.get(state)) {
          placeTree(child, nextStart, level + 1);
          nextStart += leafCounts.get(child);
        }
      };
      countLeaves(orbit[0]);
      placeTree(orbit[0], 0, 0);
      parents = [];
    }
    while (parents.length) {
      const layer = parents.flatMap((parent) => children.get(parent) ?? []);
      if (!layer.length) break;
      depth += 1;

      // The first incoming layer needs extra room for the attractor's loops.
      radius = Math.max(radius + gap + (depth === 1 ? 12 : 0), (gap * layer.length) / TAU);
      // Rotate each layer so its first tree remains near its parent. Relative
      // cyclic order is preserved across depths, avoiding crossing branches.
      const firstParent = byState.get(layer[0]).successor;
      const parentPosition = local.get(firstParent);
      const startAngle = Math.hypot(parentPosition.x, parentPosition.y) < 1
        ? -Math.PI / 2
        : Math.atan2(parentPosition.y, parentPosition.x);

      layer.forEach((state, index) => {
        const angle = startAngle + (TAU * index) / layer.length;
        local.set(state, { x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
      });
      parents = layer;
    }

    const points = [...local.values()];
    const padding = gap;
    const left = Math.min(...points.map((point) => point.x)) - padding;
    const right = Math.max(...points.map((point) => point.x)) + padding;
    const top = Math.min(...points.map((point) => point.y)) - padding;
    const bottom = Math.max(...points.map((point) => point.y)) + padding;
    return { local, left, top, width: right - left, height: bottom - top };
  });

  // A shelf layout is deterministic and adapts to differently sized basins.
  const area = components.reduce((sum, component) => sum + component.width * component.height, 0);
  const rowWidth = Math.max(Math.sqrt(area * 1.7) + gap, ...components.map((component) => component.width), 1);
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const component of components) {
    if (x > 0 && x + component.width > rowWidth) {
      x = 0;
      y += rowHeight + gap / 2;
      rowHeight = 0;
    }
    for (const [state, point] of component.local) {
      positions.set(state, { x: x + point.x - component.left, y: y + point.y - component.top });
    }
    x += component.width + gap / 2;
    rowHeight = Math.max(rowHeight, component.height);
  }
  return positions;
}

/** A static map of every configuration; intentionally has no simulation API. */
export class PhaseGraph {
  constructor(container) {
    this.cy = cytoscape({
      container,
      elements: [],
      layout: { name: 'preset' },
      minZoom: 0.005,
      maxZoom: 5,
      autoungrabify: true,
      autounselectify: true,
      boxSelectionEnabled: false,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            width: 'data(size)',
            height: 'data(size)',
            'background-color': PALETTE.transient,
            'border-color': PALETTE.transientBorder,
            'border-width': 1.5,
            color: PALETTE.ink,
            'font-family': '"IBM Plex Mono", ui-monospace, SFMono-Regular, Consolas, monospace',
            'font-size': 14,
            'font-weight': 500,
            'text-valign': 'center',
            'text-halign': 'center',
            'text-outline-color': PALETTE.transient,
            'text-outline-width': 1,
          },
        },
        {
          selector: 'node.fixed',
          style: {
            'background-color': PALETTE.fixed,
            'border-color': PALETTE.fixedBorder,
            'border-width': 3.5,
            'border-style': 'double',
            'text-outline-color': PALETTE.fixed,
            'font-weight': 700,
          },
        },
        {
          selector: 'node.cycle',
          style: {
            'background-color': PALETTE.cycle,
            'border-color': PALETTE.cycleBorder,
            'border-width': 3,
            'text-outline-color': PALETTE.cycle,
            'font-weight': 700,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'curve-style': 'bezier',
            'line-color': PALETTE.edge,
            'target-arrow-color': PALETTE.edge,
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.95,
            'control-point-step-size': 38,
            'loop-direction': '-45deg',
            'loop-sweep': '85deg',
          },
        },
        {
          selector: 'edge.fixed',
          style: {
            width: 2,
            'line-color': PALETTE.fixedBorder,
            'target-arrow-color': PALETTE.fixedBorder,
          },
        },
        {
          selector: 'edge.cycle',
          style: {
            width: 2,
            'line-color': PALETTE.cycleBorder,
            'target-arrow-color': PALETTE.cycleBorder,
          },
        },
      ],
    });
    this.resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.fit());
    this.resizeObserver?.observe(container);
  }

  setNetwork(network, analysis) {
    const nodeSize = Math.max(44, network.size * 7.3 + 16);
    const positions = layoutPhaseSpace(analysis, nodeSize);
    const stateClasses = new Map();
    const elements = analysis.states.map((state) => {
      const classes = state.isFixedPoint ? 'fixed' : state.isAttractor ? 'cycle' : 'transient';
      stateClasses.set(state.state, classes);
      return {
        data: {
          id: state.state,
          label: state.state,
          state: state.state,
          attractorId: state.attractorId,
          depth: state.depth,
          size: nodeSize,
        },
        classes,
        position: positions.get(state.state),
        locked: true,
      };
    });
    for (const transition of analysis.transitions) {
      elements.push({
        data: { id: `transition-${transition.source}`, source: transition.source, target: transition.target },
        classes: stateClasses.get(transition.source),
      });
    }

    this.cy.batch(() => {
      this.cy.elements().remove();
      this.cy.add(elements);
    });
    this.fit();
  }

  fit() {
    this.cy.resize();
    this.cy.fit(undefined, 60);
    if (this.cy.zoom() > 1.4) {
      this.cy.zoom(1.4);
      this.cy.center();
    }
  }

  zoomIn() { this.zoomBy(1.3); }
  zoomOut() { this.zoomBy(1 / 1.3); }

  zoomBy(factor) {
    this.cy.zoom({
      level: Math.max(this.cy.minZoom(), Math.min(this.cy.maxZoom(), this.cy.zoom() * factor)),
      renderedPosition: { x: this.cy.width() / 2, y: this.cy.height() / 2 },
    });
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.cy.destroy();
  }
}
