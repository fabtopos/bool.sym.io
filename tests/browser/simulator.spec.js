import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

async function phaseSnapshot(page) {
  return page.evaluate(() => {
    const cy = window.__booleanLab.phaseGraph.cy;
    return {
      elements: cy.elements().map((element) => ({
        data: element.data(),
        classes: element.classes(),
        position: element.isNode() ? element.position() : null,
        locked: element.locked(),
        selected: element.selected(),
        label: element.style('label'),
        background: element.isNode() ? element.style('background-color') : null,
        border: element.isNode() ? element.style('border-color') : null,
        line: element.isEdge() ? element.style('line-color') : null,
        arrow: element.isEdge() ? element.style('target-arrow-color') : null,
      })),
      pan: cy.pan(),
      zoom: cy.zoom(),
    };
  });
}

async function wiringSnapshot(page) {
  return page.evaluate(() => {
    const cy = window.__booleanLab.wiringGraph.cy;
    return {
      positions: cy.nodes().map((node) => ({ id: node.id(), position: node.position() })),
      connections: cy.edges().map((edge) => edge.data()),
      pan: cy.pan(),
      zoom: cy.zoom(),
    };
  });
}

async function expectWiringState(page, state) {
  await expect.poll(() => page.evaluate(() => window.__booleanLab.wiringGraph.cy.nodes().map((node) => ({
    value: node.data('value'),
    label: node.data('label'),
    name: node.data('displayName'),
    on: node.hasClass('on'),
    off: node.hasClass('off'),
    color: node.style('background-color'),
  })))).toEqual([...state].map((bit) => ({
    value: Number(bit),
    // Names are supplied below so this helper works with user-defined networks.
    label: expect.stringMatching(new RegExp(`\\n${bit}$`)),
    name: expect.any(String),
    on: bit === '1',
    off: bit === '0',
    color: bit === '1' ? 'rgb(25,135,99)' : 'rgb(201,83,83)',
  })));
  await expect(page.locator('#current-state')).toHaveText(state);
}

async function setSpeed(page, direction = 'fastest') {
  const slider = page.locator('#speed');
  await slider.focus();
  await slider.press(direction === 'fastest' ? 'End' : 'Home');
  await expect(page.locator('#speed-output')).toHaveText(direction === 'fastest' ? '5.0 steps/s' : '0.5 steps/s');
}

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Boolean Network Simulator', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__booleanLab?.phaseGraph.cy.nodes().length)).toBe(8);
  // Let the initial ResizeObserver fit finish before capturing user viewports.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
});

test('opens a complete, consistent default network with two desktop panels', async ({ page }) => {
  await expect(page).toHaveTitle(/Boolean Network Simulator/);
  await expect(page.locator('#example-select')).toHaveValue('inverting-ring');
  await expect(page.locator('#variable-count')).toHaveText('3 variables');
  await expect(page.locator('#state-count')).toHaveText('8 states');
  await expect(page.locator('#attractor-count')).toHaveText('2 attractors');
  await expect(page.locator('#current-time')).toHaveText('t = 0');
  await expectWiringState(page, '000');
  const [phaseBox, wiringBox] = await Promise.all([
    page.locator('#phase-graph').boundingBox(),
    page.locator('#wiring-graph').boundingBox(),
  ]);
  expect(phaseBox.y).toBe(wiringBox.y);
  expect(wiringBox.x).toBeGreaterThanOrEqual(phaseBox.x + phaseBox.width);

  const graphs = await page.evaluate(() => {
    const { phaseGraph, wiringGraph, network } = window.__booleanLab;
    return {
      states: phaseGraph.cy.nodes().map((node) => node.data('state')),
      phaseEdges: phaseGraph.cy.edges().map((edge) => ({ source: edge.data('source'), target: edge.data('target') })),
      expectedEdges: phaseGraph.cy.nodes().map((node) => ({ source: node.id(), target: network.nextState(node.id()) })),
      arrows: phaseGraph.cy.edges().map((edge) => edge.style('target-arrow-shape')),
      dependencies: wiringGraph.cy.edges().map((edge) => `${edge.source().data('name')}->${edge.target().data('name')}`).sort(),
      draggable: wiringGraph.cy.nodes().map((node) => node.grabbable()),
    };
  });
  expect(graphs.states).toEqual(['000', '001', '010', '011', '100', '101', '110', '111']);
  expect(graphs.phaseEdges).toEqual(graphs.expectedEdges);
  expect(graphs.arrows).toEqual(Array(8).fill('triangle'));
  expect(graphs.dependencies).toEqual(['A->B', 'B->C', 'C->A']);
  expect(graphs.draggable).toEqual([true, true, true]);
  await expect(page.locator('#history li')).toHaveCount(1);
  await expect(page.locator('#attractor-list .attractor-item.cycle')).toHaveCount(2);
});

test('keeps the phase graph entirely static and preserves wiring nodes throughout simulation', async ({ page }) => {
  // Customize both views before playback so an accidental refit is observable.
  await page.getByRole('button', { name: 'Zoom in phase graph', exact: true }).click();
  await page.evaluate(() => {
    const { phaseGraph, wiringGraph } = window.__booleanLab;
    phaseGraph.cy.panBy({ x: 23, y: 17 });
    window.__phaseElements = [...phaseGraph.cy.elements()];
    window.__wiringElements = [...wiringGraph.cy.elements()];
  });

  // Drag an actual Cytoscape node; its new layout must survive every state update.
  const nodeBefore = await page.evaluate(() => window.__booleanLab.wiringGraph.cy.nodes()[0].position());
  const dragPoint = await page.evaluate(() => {
    const node = window.__booleanLab.wiringGraph.cy.nodes()[0];
    const point = node.renderedPosition();
    const box = document.querySelector('#wiring-graph').getBoundingClientRect();
    return { x: box.left + point.x, y: box.top + point.y };
  });
  await page.mouse.move(dragPoint.x, dragPoint.y);
  await page.mouse.down();
  await page.mouse.move(dragPoint.x + 35, dragPoint.y + 24, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__booleanLab.wiringGraph.cy.nodes()[0].position())).not.toEqual(nodeBefore);

  const phaseBefore = await phaseSnapshot(page);
  const wiringBefore = await wiringSnapshot(page);
  await page.evaluate(() => {
    window.__phaseMutations = [];
    window.__booleanLab.phaseGraph.cy.on('data position style add remove pan zoom', (event) => {
      window.__phaseMutations.push(event.type);
    });
  });
  const expectPreserved = async () => {
    expect(await phaseSnapshot(page)).toEqual(phaseBefore);
    expect(await wiringSnapshot(page)).toEqual(wiringBefore);
    expect(await page.evaluate(() => {
      const { phaseGraph, wiringGraph } = window.__booleanLab;
      return {
        phase: window.__phaseElements.every((element, index) => element === phaseGraph.cy.elements()[index]),
        wiring: window.__wiringElements.every((element, index) => element === wiringGraph.cy.elements()[index]),
      };
    })).toEqual({ phase: true, wiring: true });
    expect(await page.evaluate(() => window.__phaseMutations)).toEqual([]);
  };

  await page.locator('#apply-network').click();
  await expectPreserved();

  await page.locator('#initial-state').fill('101');
  await expectWiringState(page, '101');
  await expect(page.locator('#initial-toggles [data-bit="0"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#initial-toggles [data-bit="1"]')).toHaveAttribute('aria-pressed', 'false');
  await expectPreserved();
  await page.locator('#initial-toggles [data-bit="1"]').click();
  await expect(page.locator('#initial-state')).toHaveValue('111');
  await expectWiringState(page, '111');
  await expectPreserved();
  await page.locator('#step-button').click();
  await expect(page.locator('#current-time')).toHaveText('t = 1');
  await expectWiringState(page, '011');
  await expectPreserved();

  await page.locator('#initial-state').fill('000');
  await setSpeed(page);
  await page.locator('#play-button').click();
  await expect(page.locator('#terminal-message')).toContainText('Cycle detected. Period = 6.');
  await expect(page.locator('#current-time')).toHaveText('t = 6');
  await expectWiringState(page, '000');
  await expect(page.locator('#history li strong')).toHaveText(['000', '100', '110', '111', '011', '001', '000']);
  await expect(page.locator('#play-button')).toBeDisabled();
  await expect(page.locator('#step-button')).toBeDisabled();
  await expect(page.locator('#history .in-orbit')).toHaveCount(6);
  await expect(page.locator('#history .repeated')).toHaveCount(1);
  expect(await page.evaluate(() => window.__booleanLab.simulation.playing)).toBe(false);
  await expectPreserved();

  await page.locator('#reset-button').click();
  await expectWiringState(page, '000');
  await expect(page.locator('#current-time')).toHaveText('t = 0');
  await expect(page.locator('#history li')).toHaveCount(1);
  await expect(page.locator('#terminal-message')).toBeHidden();
  await expect(page.locator('#play-button')).toBeEnabled();
  await expectPreserved();
});

test('pauses cleanly, updates speed, and resumes without duplicate playback', async ({ page }) => {
  await page.locator('#play-button').click();
  await expect(page.locator('#play-button')).toHaveText('Pause');
  await expect(page.locator('#step-button')).toBeDisabled();
  await expect(page.locator('#current-time')).toHaveText('t = 1');
  await page.locator('#play-button').click();
  await expect(page.locator('#play-button')).toHaveText('Play');
  await expect(page.locator('#step-button')).toBeEnabled();
  const pausedTime = await page.locator('#current-time').textContent();
  // More than the former 667 ms interval: any stale timer would advance.
  await page.waitForTimeout(800);
  await expect(page.locator('#current-time')).toHaveText(pausedTime);
  expect(await page.evaluate(() => window.__booleanLab.simulation.playing)).toBe(false);
  await setSpeed(page);
  expect(await page.evaluate(() => window.__booleanLab.simulation.interval)).toBe(200);
  await page.locator('#play-button').click();
  await expect(page.locator('#terminal-message')).toContainText('Period = 6');
  await expect(page.locator('#current-time')).toHaveText('t = 6');
  await expect(page.locator('#history li')).toHaveCount(7);
});

test('rejects invalid initial configurations while retaining the displayed state', async ({ page }) => {
  const phase = await phaseSnapshot(page);
  await page.locator('#initial-state').fill('10x');
  await expect(page.locator('#initial-error')).toContainText('exactly 3 binary digits');
  await expect(page.locator('#initial-state')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#play-button')).toBeDisabled();
  await expect(page.locator('#step-button')).toBeDisabled();
  await expectWiringState(page, '000');
  expect(await phaseSnapshot(page)).toEqual(phase);
  await page.locator('#initial-state').fill('101');
  await expect(page.locator('#initial-error')).toBeHidden();
  await expect(page.locator('#initial-state')).toHaveAttribute('aria-invalid', 'false');
  await expect(page.locator('#play-button')).toBeEnabled();
  await expect(page.locator('#step-button')).toBeEnabled();
  await expectWiringState(page, '101');
});

test('Reset and variable toggles recover from invalid initial input', async ({ page }) => {
  const phase = await phaseSnapshot(page);
  await page.locator('#initial-state').fill('101');
  await page.locator('#step-button').click();
  await expectWiringState(page, '010');
  await page.locator('#initial-state').fill('bad');
  await expect(page.locator('#play-button')).toBeDisabled();
  await expect(page.locator('#step-button')).toBeDisabled();
  await page.locator('#reset-button').click();
  await expect(page.locator('#initial-state')).toHaveValue('101');
  await expect(page.locator('#initial-state')).toHaveAttribute('aria-invalid', 'false');
  await expect(page.locator('#initial-error')).toBeHidden();
  await expect(page.locator('#current-time')).toHaveText('t = 0');
  await expect(page.locator('#play-button')).toBeEnabled();
  await expect(page.locator('#step-button')).toBeEnabled();
  await expectWiringState(page, '101');
  await page.locator('#initial-state').fill('');
  await expect(page.locator('#play-button')).toBeDisabled();
  await page.locator('#initial-toggles [data-bit="1"]').click();
  await expect(page.locator('#initial-state')).toHaveValue('111');
  await expect(page.locator('#initial-error')).toBeHidden();
  await expect(page.locator('#play-button')).toBeEnabled();
  await expect(page.locator('#step-button')).toBeEnabled();
  await expectWiringState(page, '111');
  expect(await phaseSnapshot(page)).toEqual(phase);
});

test('invalid rules retain the applied network and expose helpful parser errors', async ({ page }) => {
  const phase = await phaseSnapshot(page);
  await page.evaluate(() => { window.__appliedNetwork = window.__booleanLab.network; });
  await page.getByRole('textbox', { name: 'Update rule for variable 1', exact: true }).fill('!Missing');
  await expect(page.locator('#play-button')).toBeDisabled();
  await page.locator('#apply-network').click();
  await expect(page.locator('#editor-error')).toContainText('Unknown variable "Missing"');
  expect(await phaseSnapshot(page)).toEqual(phase);
  expect(await page.evaluate(() => window.__appliedNetwork === window.__booleanLab.network)).toBe(true);
  await page.getByRole('textbox', { name: 'Update rule for variable 1', exact: true }).fill('!C &&');
  await page.locator('#apply-network').click();
  await expect(page.locator('#editor-error')).toBeVisible();
  await expect(page.locator('#editor-error')).toContainText('column');
  expect(await phaseSnapshot(page)).toEqual(phase);
  await page.getByRole('textbox', { name: 'Update rule for variable 1', exact: true }).fill('!C');
  await page.locator('#apply-network').click();
  await expect(page.locator('#editor-error')).toBeHidden();
  await expect(page.locator('#editor-status')).toHaveText('Applied');
  await expect(page.locator('#play-button')).toBeEnabled();
});

test('renames a variable and updates its references and wiring dependencies', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Variable 2 name', exact: true }).fill('Signal');
  await page.getByRole('textbox', { name: 'Variable 2 name', exact: true }).press('Tab');
  await expect(page.getByRole('textbox', { name: 'Update rule for variable 3', exact: true })).toHaveValue('Signal');
  await page.locator('#apply-network').click();
  await expect(page.locator('#editor-error')).toBeHidden();
  await expect(page.locator('#example-select')).toHaveValue('custom');
  expect(await page.evaluate(() => window.__booleanLab.network.names)).toEqual(['A', 'Signal', 'C']);
  expect(await page.evaluate(() => window.__booleanLab.wiringGraph.cy.edges().map((edge) => `${edge.source().data('name')}->${edge.target().data('name')}`).sort())).toEqual(['A->Signal', 'C->A', 'Signal->C']);
  await expect(page.locator('#initial-toggles [data-bit="1"]')).toHaveAccessibleName('Initial value of Signal: 0');
  await page.locator('#step-button').click();
  await expectWiringState(page, '100');
});

test('Enter applies a variable rename and refactors rules before validation', async ({ page }) => {
  await page.locator('#initial-state').fill('101');
  const name = page.getByRole('textbox', { name: 'Variable 1 name', exact: true });
  await name.fill('Signal');
  await name.press('Enter');
  await expect(page.locator('#editor-status')).toHaveText('Applied');
  await expect(page.locator('#editor-error')).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Update rule for variable 2', exact: true })).toHaveValue('Signal');
  expect(await page.evaluate(() => window.__booleanLab.network.names)).toEqual(['Signal', 'B', 'C']);
  expect(await page.evaluate(() => window.__booleanLab.wiringGraph.cy.edges().map((edge) => `${edge.source().data('name')}->${edge.target().data('name')}`).sort())).toEqual(['B->C', 'C->Signal', 'Signal->B']);
  await expect(page.locator('#initial-state')).toHaveValue('101');
  await expectWiringState(page, '101');
  await page.locator('#step-button').click();
  await expectWiringState(page, '010');
});

for (const [invalidName, errorText] of [['B', 'unique'], ['Bad!', 'starting with a letter']]) {
  test(`corrects the invalid rename ${invalidName} without losing original references`, async ({ page }) => {
    const phase = await phaseSnapshot(page);
    const name = page.getByRole('textbox', { name: 'Variable 1 name', exact: true });
    await name.fill(invalidName);
    await name.press('Tab');
    await expect(page.getByRole('textbox', { name: 'Update rule for variable 2', exact: true })).toHaveValue('A');
    await page.locator('#apply-network').click();
    await expect(page.locator('#editor-error')).toContainText(errorText);
    expect(await page.evaluate(() => window.__booleanLab.network.names)).toEqual(['A', 'B', 'C']);
    expect(await phaseSnapshot(page)).toEqual(phase);
    await name.fill('Signal');
    await name.press('Enter');
    await expect(page.locator('#editor-status')).toHaveText('Applied');
    await expect(page.locator('#editor-error')).toBeHidden();
    await expect(page.getByRole('textbox', { name: 'Update rule for variable 2', exact: true })).toHaveValue('Signal');
    expect(await page.evaluate(() => window.__booleanLab.network.names)).toEqual(['Signal', 'B', 'C']);
    await page.locator('#step-button').click();
    await expectWiringState(page, '100');
  });
}

test('adds and removes variables and regenerates both graph representations', async ({ page }) => {
  await page.locator('#add-variable').click();
  await expect(page.locator('#variable-rows .variable-row')).toHaveCount(4);
  await expect(page.getByRole('textbox', { name: 'Variable 4 name', exact: true })).toHaveValue('D');
  await expect(page.getByRole('textbox', { name: 'Update rule for variable 4', exact: true })).toHaveValue('0');
  await page.locator('#apply-network').click();
  await expect(page.locator('#state-count')).toHaveText('16 states');
  await expectWiringState(page, '0000');
  expect(await page.evaluate(() => window.__booleanLab.phaseGraph.cy.nodes().length)).toBe(16);
  expect(await page.evaluate(() => window.__booleanLab.wiringGraph.cy.nodes().length)).toBe(4);
  await page.getByRole('button', { name: 'Remove variable 4', exact: true }).click();
  await page.locator('#apply-network').click();
  await expect(page.locator('#state-count')).toHaveText('8 states');
  await expectWiringState(page, '000');
  expect(await page.evaluate(() => window.__booleanLab.phaseGraph.cy.nodes().length)).toBe(8);
  expect(await page.evaluate(() => window.__booleanLab.wiringGraph.cy.nodes().length)).toBe(3);
});

test('verifies the fixed-point example and its complete basin', async ({ page }) => {
  await page.locator('#example-select').selectOption('fixed-cascade');
  await expect(page.locator('#attractor-count')).toHaveText('1 attractor');
  await expect(page.locator('#attractor-list .attractor-item.fixed')).toHaveCount(1);
  await expect(page.locator('#attractor-list')).toContainText('8 of 8 states');
  const phase = await phaseSnapshot(page);
  await setSpeed(page);
  await page.locator('#play-button').click();
  await expect(page.locator('#simulation-status')).toContainText('Fixed point reached');
  await expect(page.locator('#terminal-message')).toContainText('Fixed point: 111.');
  await expect(page.locator('#current-time')).toHaveText('t = 4');
  await expectWiringState(page, '111');
  await expect(page.locator('#history li strong')).toHaveText(['000', '100', '110', '111', '111']);
  expect(await phaseSnapshot(page)).toEqual(phase);
});

test('verifies multiple attractors, nontrivial basins, and transition table', async ({ page }) => {
  await page.locator('#example-select').selectOption('multiple-attractors');
  await expect(page.locator('#attractor-count')).toHaveText('4 attractors');
  await expect(page.locator('#attractor-list .attractor-item.fixed')).toHaveCount(3);
  await expect(page.locator('#attractor-list .attractor-item.cycle')).toHaveCount(1);
  await expect(page.locator('#attractor-list')).toContainText('4 of 8 states');
  await expect(page.locator('#attractor-list .attractor-item.cycle')).toContainText('period 2');
  await expectWiringState(page, '010');
  await page.locator('.transition-details summary').click();
  await expect(page.locator('#transition-table tr')).toHaveCount(8);
  await expect(page.locator('#transition-table tr').filter({ has: page.locator('td').filter({ hasText: /^010$/ }) })).toContainText('001');
  const phase = await phaseSnapshot(page);
  await setSpeed(page);
  await page.locator('#play-button').click();
  await expect(page.locator('#terminal-message')).toContainText('Fixed point: 000.');
  await expect(page.locator('#current-time')).toHaveText('t = 3');
  await expect(page.locator('#history li strong')).toHaveText(['010', '001', '000', '000']);
  expect(await phaseSnapshot(page)).toEqual(phase);
});

test('supports eight variables and the entire 256-state phase space', async ({ page }) => {
  for (let size = 3; size < 8; size += 1) await page.locator('#add-variable').click();
  await expect(page.locator('#variable-rows .variable-row')).toHaveCount(8);
  await expect(page.locator('#add-variable')).toBeDisabled();
  await page.locator('#apply-network').click();
  await expect(page.locator('#variable-count')).toHaveText('8 variables');
  await expect(page.locator('#state-count')).toHaveText('256 states');
  await expectWiringState(page, '00000000');
  expect(await page.evaluate(() => {
    const { phaseGraph, wiringGraph, network } = window.__booleanLab;
    return {
      states: phaseGraph.cy.nodes().length,
      edges: phaseGraph.cy.edges().length,
      variables: wiringGraph.cy.nodes().length,
      labels: phaseGraph.cy.nodes().every((node) => /^[01]{8}$/.test(node.data('label'))),
      transitions: phaseGraph.cy.edges().every((edge) => network.nextState(edge.data('source')) === edge.data('target')),
    };
  })).toEqual({ states: 256, edges: 256, variables: 8, labels: true, transitions: true });
  const phase = await phaseSnapshot(page);
  await page.locator('#step-button').click();
  await expectWiringState(page, '10000000');
  expect(await phaseSnapshot(page)).toEqual(phase);
});

test('allows graph navigation and keyboard access to the guide', async ({ page }) => {
  const initialZoom = await page.evaluate(() => window.__booleanLab.phaseGraph.cy.zoom());
  await page.getByRole('button', { name: 'Zoom in phase graph', exact: true }).click();
  expect(await page.evaluate(() => window.__booleanLab.phaseGraph.cy.zoom())).toBeGreaterThan(initialZoom);
  await page.getByRole('button', { name: 'Zoom out phase graph', exact: true }).click();
  expect(await page.evaluate(() => window.__booleanLab.phaseGraph.cy.zoom())).toBeCloseTo(initialZoom);
  await page.getByRole('button', { name: 'Reset phase graph view', exact: true }).click();
  const wiringZoom = await page.evaluate(() => window.__booleanLab.wiringGraph.cy.zoom());
  await page.getByRole('button', { name: 'Zoom in wiring graph', exact: true }).click();
  expect(await page.evaluate(() => window.__booleanLab.wiringGraph.cy.zoom())).toBeGreaterThan(wiringZoom);
  await page.getByRole('button', { name: 'Reset wiring graph view', exact: true }).click();
  await page.locator('#guide-open').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#guide-dialog')).toBeVisible();
  await expect(page.locator('#guide-dialog')).toContainText('all variables change simultaneously');
  await page.keyboard.press('Escape');
  await expect(page.locator('#guide-dialog')).toBeHidden();
});

test('exports the actual visited trajectory as CSV', async ({ page }) => {
  await page.locator('#step-button').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-history').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('boolean-network-trajectory.csv');
  const path = await download.path();
  expect(await readFile(path, 'utf8')).toBe('time,state,A,B,C\n0,000,0,0,0\n1,100,1,0,0\n');
});

test('fits every node after desktop-to-mobile resizing while preserving graph structure', async ({ page }) => {
  const modelSnapshot = () => page.evaluate(() => {
    const { phaseGraph, wiringGraph } = window.__booleanLab;
    return [phaseGraph.cy, wiringGraph.cy].map((cy) => ({
      nodes: cy.nodes().map((node) => ({ data: node.data(), position: node.position(), classes: node.classes() })),
      edges: cy.edges().map((edge) => edge.data()),
    }));
  });
  const original = await modelSnapshot();
  const expectAllNodesVisible = async () => {
    await expect.poll(() => page.evaluate(() => {
      const { phaseGraph, wiringGraph } = window.__booleanLab;
      return [phaseGraph.cy, wiringGraph.cy].every((cy) => {
        const bounds = cy.nodes().renderedBoundingBox({ includeLabels: true, includeOverlays: false });
        const container = cy.container();
        return cy.width() === container.clientWidth && cy.height() === container.clientHeight
          && bounds.x1 >= -1 && bounds.y1 >= -1
          && bounds.x2 <= container.clientWidth + 1 && bounds.y2 <= container.clientHeight + 1;
      });
    })).toBe(true);
  };
  await expectAllNodesVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectAllNodesVisible();
  expect(await modelSnapshot()).toEqual(original);
  const [phaseBox, wiringBox] = await Promise.all([
    page.locator('#phase-graph').boundingBox(),
    page.locator('#wiring-graph').boundingBox(),
  ]);
  expect(wiringBox.y).toBeGreaterThanOrEqual(phaseBox.y + phaseBox.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const mobilePhase = await phaseSnapshot(page);
  await page.locator('#step-button').click();
  await expectWiringState(page, '100');
  expect(await phaseSnapshot(page)).toEqual(mobilePhase);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await expectAllNodesVisible();
});

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('stacks the graphs, avoids horizontal page overflow, and remains interactive', async ({ page }) => {
    const [phaseBox, wiringBox] = await Promise.all([
      page.locator('#phase-graph').boundingBox(),
      page.locator('#wiring-graph').boundingBox(),
    ]);
    expect(wiringBox.y).toBeGreaterThanOrEqual(phaseBox.y + phaseBox.height);
    expect(wiringBox.x).toBe(phaseBox.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('#initial-state').fill('101');
    await expectWiringState(page, '101');
    await page.locator('#step-button').click();
    await expectWiringState(page, '010');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
