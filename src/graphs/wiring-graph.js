import cytoscape from 'cytoscape';

function stateValues(state, size, radix) {
  const values = typeof state === 'string' ? [...state].map((value) => /^[0-2]$/.test(value) ? Number(value) : NaN)
    : Array.isArray(state) ? Array.from(state) : null;
  if (!values || values.length !== size || values.some((value) => !Number.isInteger(value) || value < 0 || value >= radix)) {
    throw new Error(`The wiring state must contain exactly ${size} ${radix === 3 ? 'ternary' : 'Boolean'} values.`);
  }
  return values.map(String);
}

const stateClass = (value, radix) => value === '0' ? 'off' : radix === 3 && value === '1' ? 'middle' : 'on';

/** The only animated graph: changes in state never rebuild or lay out nodes. */
export class WiringGraph {
  constructor(container) {
    this.size = 0;
    this.radix = 2;
    this.motionPreference = typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    this.cy = cytoscape({
      container,
      elements: [],
      layout: { name: 'preset' },
      minZoom: 0.08,
      maxZoom: 4,
      autounselectify: true,
      boxSelectionEnabled: false,
      style: [
        {
          selector: 'node',
          style: {
            width: 'data(size)',
            height: 'data(size)',
            label: 'data(label)',
            'background-color': '#c95353',
            'border-color': '#a43d3d',
            'border-width': 2.5,
            color: '#ffffff',
            'font-family': '"IBM Plex Sans", system-ui, sans-serif',
            'font-size': 17,
            'font-weight': 600,
            'text-wrap': 'wrap',
            'text-overflow-wrap': 'anywhere',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-max-width': 'data(labelWidth)',
            'line-height': 1.35,
            'transition-property': 'background-color, border-color',
            'transition-duration': this.motionPreference?.matches ? '0ms' : '180ms',
            'transition-timing-function': 'ease-in-out',
            'overlay-padding': 8,
          },
        },
        {
          selector: 'node.on',
          style: { 'background-color': '#198763', 'border-color': '#0c684a' },
        },
        {
          selector: 'node.off',
          style: { 'background-color': '#c95353', 'border-color': '#a43d3d' },
        },
        {
          selector: 'node.middle',
          style: { 'background-color': '#e9ba3a', 'border-color': '#b78b1d', color: '#3d3214' },
        },
        {
          selector: 'node:grabbed',
          style: { 'border-width': 4, 'overlay-color': '#6889a7', 'overlay-opacity': 0.1 },
        },
        {
          selector: 'edge',
          style: {
            width: 2,
            'curve-style': 'bezier',
            'line-color': '#899fb1',
            'target-arrow-color': '#607e97',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 1.2,
            'control-point-step-size': 46,
            'loop-direction': '-45deg',
            'loop-sweep': '75deg',
          },
        },
      ],
    });
    this.resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.fit());
    this.resizeObserver?.observe(container);
    this.onMotionChange = () => {
      this.cy.style().selector('node')
        .style('transition-duration', this.motionPreference.matches ? '0ms' : '180ms')
        .update();
    };
    this.motionPreference?.addEventListener('change', this.onMotionChange);
  }

  setNetwork(network, state) {
    const radix = network.radix ?? 2;
    if (radix !== 2 && radix !== 3) throw new Error('The wiring network must use Boolean or ternary values.');
    const values = stateValues(state, network.size, radix);
    const indices = new Map(network.names.map((name, index) => [name, index]));
    const sizes = network.variables.map((variable) => Math.max(78, Math.min(180, variable.name.length * 9 + 22)));
    const radius = network.size === 1 ? 0 : Math.max(116, (network.size * (Math.max(...sizes) + 52)) / (2 * Math.PI));
    const elements = network.variables.map((variable, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / network.size;
      // Keep full names as graph data and in the editor; bound only the canvas
      // label so unusually long identifiers cannot obscure nearby variables.
      const displayName = variable.name.length > 64 ? `${variable.name.slice(0, 61)}…` : variable.name;
      return {
        data: {
          id: `variable-${index}`,
          name: variable.name,
          displayName,
          label: `${displayName}\n${values[index]}`,
          index,
          value: Number(values[index]),
          size: sizes[index],
          labelWidth: sizes[index] - 20,
        },
        classes: stateClass(values[index], radix),
        position: { x: radius * Math.cos(angle), y: radius * Math.sin(angle) },
      };
    });

    network.variables.forEach((variable, targetIndex) => {
      for (const dependency of new Set(variable.dependencies)) {
        const sourceIndex = indices.get(dependency);
        if (sourceIndex === undefined) throw new Error(`Unknown wiring variable “${dependency}”.`);
        elements.push({
          data: {
            id: `wire-${sourceIndex}-${targetIndex}`,
            source: `variable-${sourceIndex}`,
            target: `variable-${targetIndex}`,
          },
        });
      }
    });

    this.size = network.size;
    this.radix = radix;
    this.cy.batch(() => {
      this.cy.elements().remove();
      this.cy.add(elements);
    });
    this.fit();
  }

  setState(state) {
    const values = stateValues(state, this.size, this.radix);
    this.cy.batch(() => {
      values.forEach((value, index) => {
        const node = this.cy.getElementById(`variable-${index}`);
        node.data({ value: Number(value), label: `${node.data('displayName')}\n${value}` });
        node.classes(stateClass(value, this.radix));
      });
    });
  }

  fit() {
    this.cy.resize();
    this.cy.fit(undefined, 60);
    if (this.cy.zoom() > 1.25) {
      this.cy.zoom(1.25);
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
    this.motionPreference?.removeEventListener('change', this.onMotionChange);
    this.cy.destroy();
  }
}
