import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

async function openTernary(page) {
  await page.locator('#mode-ternary').click();
  await expect(page.getByRole('heading', { name: 'Ternary Network Simulator', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__booleanLab.network.radix)).toBe(3);
  // The initial ResizeObserver fit must finish before comparing viewports.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

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

async function expectTernaryState(page, state) {
  const colors = ['rgb(201,83,83)', 'rgb(233,186,58)', 'rgb(25,135,99)'];
  await expect.poll(() => page.evaluate(() => window.__booleanLab.wiringGraph.cy.nodes().map((node) => ({
    value: node.data('value'),
    label: node.data('label'),
    off: node.hasClass('off'),
    middle: node.hasClass('middle'),
    on: node.hasClass('on'),
    color: node.style('background-color'),
  })))).toEqual([...state].map((digit) => ({
    value: Number(digit),
    label: expect.stringMatching(new RegExp(`\\n${digit}$`)),
    off: digit === '0',
    middle: digit === '1',
    on: digit === '2',
    color: colors[Number(digit)],
  })));
  await expect(page.locator('#current-state')).toHaveText(state);
}

async function fastest(page) {
  await page.locator('#speed').focus();
  await page.locator('#speed').press('End');
  await expect(page.locator('#speed-output')).toHaveText('5.0 steps/s');
}

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.__booleanLab?.phaseGraph.cy.nodes().length)).toBe(8);
});

test('opens an independent ternary module with the complete nine-state graph and all three wiring colors', async ({ page }) => {
  await openTernary(page);
  await expect(page.locator('#mode-ternary')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#mode-boolean')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#example-select')).toHaveValue('ternary-cycle');
  await expect(page.locator('#variable-count')).toHaveText('2 variables');
  await expect(page.locator('#state-count')).toHaveText('9 states');
  await expect(page.locator('#attractor-count')).toHaveText('1 attractor');
  await expect(page.locator('#attractor-list')).toContainText('9 of 9 states');
  const graph = await page.evaluate(() => {
    const { phaseGraph, wiringGraph, network } = window.__booleanLab;
    return {
      states: phaseGraph.cy.nodes().map((node) => node.id()),
      edges: phaseGraph.cy.edges().map((edge) => [edge.data('source'), edge.data('target')]),
      expected: phaseGraph.cy.nodes().map((node) => [node.id(), network.nextState(node.id())]),
      dependencies: wiringGraph.cy.edges().map((edge) => `${edge.source().data('name')}->${edge.target().data('name')}`).sort(),
    };
  });
  expect(graph.states).toEqual(['00', '01', '02', '10', '11', '12', '20', '21', '22']);
  expect(graph.edges).toEqual(graph.expected);
  expect(graph.dependencies).toEqual(['A->A', 'A->B']);
  await expectTernaryState(page, '00');
  await page.locator('#initial-state').fill('12');
  await expectTernaryState(page, '12');
  await expect(page.locator('#initial-toggles [data-bit="0"]')).toHaveAccessibleName('Initial value of A: 1');
  await expect(page.locator('#initial-toggles [data-bit="1"]')).toHaveAccessibleName('Initial value of B: 2');
});

test('keeps ternary phase elements and wiring positions unchanged through stepping, first-repeat playback, and reset', async ({ page }) => {
  await openTernary(page);
  await page.getByRole('button', { name: 'Zoom in phase graph', exact: true }).click();
  await page.evaluate(() => {
    const { phaseGraph, wiringGraph } = window.__booleanLab;
    phaseGraph.cy.panBy({ x: 27, y: 13 });
    wiringGraph.cy.nodes()[0].position({ x: 45, y: 90 });
    window.__ternaryPhaseElements = [...phaseGraph.cy.elements()];
    window.__ternaryWiringElements = [...wiringGraph.cy.elements()];
    window.__ternaryPositions = wiringGraph.cy.nodes().map((node) => node.position());
    window.__ternaryMutations = [];
    phaseGraph.cy.on('data position style add remove pan zoom', (event) => window.__ternaryMutations.push(event.type));
  });
  const phaseBefore = await phaseSnapshot(page);
  const expectPreserved = async () => {
    expect(await phaseSnapshot(page)).toEqual(phaseBefore);
    expect(await page.evaluate(() => {
      const { phaseGraph, wiringGraph } = window.__booleanLab;
      return {
        phase: window.__ternaryPhaseElements.every((element, index) => element === phaseGraph.cy.elements()[index]),
        wiring: window.__ternaryWiringElements.every((element, index) => element === wiringGraph.cy.elements()[index]),
        positions: wiringGraph.cy.nodes().map((node) => node.position()),
        expectedPositions: window.__ternaryPositions,
        mutations: window.__ternaryMutations,
      };
    })).toMatchObject({ phase: true, wiring: true, positions: expect.any(Array), mutations: [] });
    const stable = await page.evaluate(() => ({ positions: window.__booleanLab.wiringGraph.cy.nodes().map((node) => node.position()), expected: window.__ternaryPositions }));
    expect(stable.positions).toEqual(stable.expected);
  };
  await page.locator('#apply-network').click();
  await expectPreserved();
  await page.locator('#initial-state').fill('12');
  await expectTernaryState(page, '12');
  await expectPreserved();
  await page.locator('#step-button').click();
  await expectTernaryState(page, '21');
  await expect(page.locator('#current-time')).toHaveText('t = 1');
  await expectPreserved();
  await page.locator('#initial-state').fill('00');
  await fastest(page);
  await page.locator('#play-button').click();
  await expect(page.locator('#terminal-message')).toContainText('Cycle detected. Period = 3.');
  await expect(page.locator('#current-time')).toHaveText('t = 4');
  await expect(page.locator('#history li strong')).toHaveText(['00', '10', '21', '02', '10']);
  await expect(page.locator('#history .in-orbit')).toHaveCount(3);
  await expect(page.locator('#history .repeated')).toHaveCount(1);
  await expectTernaryState(page, '10');
  await expect(page.locator('#play-button')).toBeDisabled();
  await expect(page.locator('#step-button')).toBeDisabled();
  expect(await page.evaluate(() => window.__booleanLab.simulation.playing)).toBe(false);
  await expectPreserved();
  await page.locator('#reset-button').click();
  await expectTernaryState(page, '00');
  await expect(page.locator('#current-time')).toHaveText('t = 0');
  await expect(page.locator('#history li')).toHaveCount(1);
  await expect(page.locator('#terminal-message')).toBeHidden();
  await expectPreserved();
});

test('validates ternary state strings and cycles keyboard-accessible initial controls through all values', async ({ page }) => {
  await openTernary(page);
  const phase = await phaseSnapshot(page);
  await page.locator('#initial-state').fill('03');
  await expect(page.locator('#initial-error')).toContainText('exactly 2 ternary digits');
  await expect(page.locator('#initial-state')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#play-button')).toBeDisabled();
  await expectTernaryState(page, '00');
  const toggle = page.locator('#initial-toggles [data-bit="0"]');
  await toggle.focus();
  for (const state of ['10', '20', '00']) {
    await toggle.press('Space');
    await expect(page.locator('#initial-state')).toHaveValue(state);
    await expectTernaryState(page, state);
    await expect(toggle).toHaveAccessibleName(`Initial value of A: ${state[0]}`);
    await expect(page.locator('#initial-error')).toBeHidden();
    await expect(page.locator('#play-button')).toBeEnabled();
  }
  await expect(toggle).not.toHaveAttribute('aria-pressed', /.+/);
  expect(await phaseSnapshot(page)).toEqual(phase);
  await page.locator('#initial-state').fill('2');
  await expect(page.locator('#initial-error')).toBeVisible();
  await page.locator('#reset-button').click();
  await expect(page.locator('#initial-state')).toHaveValue('00');
  await expect(page.locator('#initial-error')).toBeHidden();
});

test('accepts safe ternary rules and retains the applied graph for unknown names and unsupported functions', async ({ page }) => {
  await openTernary(page);
  const first = page.getByRole('textbox', { name: 'Update rule for variable 1', exact: true });
  const second = page.getByRole('textbox', { name: 'Update rule for variable 2', exact: true });
  await first.fill('2 - B');
  await second.fill('A + 1');
  await page.locator('#apply-network').click();
  await expect(page.locator('#editor-error')).toBeHidden();
  await page.locator('#initial-state').fill('12');
  await page.locator('#step-button').click();
  await expectTernaryState(page, '02');
  // This rules out an in-place update: both expressions read the old 12.
  expect(await page.evaluate(() => window.__booleanLab.network.nextState('12'))).toBe('02');
  const phase = await phaseSnapshot(page);
  await first.fill('Missing + 1');
  await page.locator('#apply-network').click();
  await expect(page.locator('#editor-error')).toContainText('Unknown variable "Missing"');
  expect(await phaseSnapshot(page)).toEqual(phase);
  await first.fill('alert(A)');
  await page.locator('#apply-network').click();
  await expect(page.locator('#editor-error')).toBeVisible();
  expect(await phaseSnapshot(page)).toEqual(phase);
  await first.fill('!A');
  await page.locator('#apply-network').click();
  await expect(page.locator('#editor-error')).toContainText('Boolean');
  expect(await phaseSnapshot(page)).toEqual(phase);
  await first.fill('2');
  await second.fill('A - 1');
  await page.locator('#apply-network').click();
  await expect(page.locator('#editor-error')).toBeHidden();
  await page.locator('#initial-state').fill('02');
  await page.locator('#step-button').click();
  await expectTernaryState(page, '22');
});

test('renders complete fixed-point and multiple-attractor ternary examples', async ({ page }) => {
  await openTernary(page);
  await page.locator('#example-select').selectOption('ternary-cascade');
  await expect(page.locator('#state-count')).toHaveText('27 states');
  await expect(page.locator('#attractor-count')).toHaveText('1 attractor');
  await expect(page.locator('#attractor-list .attractor-item.fixed')).toHaveCount(1);
  await expect(page.locator('#attractor-list')).toContainText('27 of 27 states');
  await fastest(page);
  await page.locator('#play-button').click();
  await expect(page.locator('#terminal-message')).toContainText('Fixed point: 222.');
  await expect(page.locator('#history li strong')).toHaveText(['000', '200', '220', '222', '222']);
  await expectTernaryState(page, '222');
  await page.locator('#example-select').selectOption('ternary-multiple');
  await expect(page.locator('#state-count')).toHaveText('9 states');
  await expect(page.locator('#attractor-count')).toHaveText('6 attractors');
  await expect(page.locator('#attractor-list .attractor-item.fixed')).toHaveCount(5);
  await expect(page.locator('#attractor-list .attractor-item.cycle')).toHaveCount(1);
  const attractors = await page.evaluate(() => window.__booleanLab.phaseGraph.cy.nodes().filter((node) => node.hasClass('fixed')).map((node) => node.id()).sort());
  expect(attractors).toEqual(['00', '10', '11', '12', '20']);
  await page.locator('#initial-state').fill('21');
  await page.locator('#play-button').click();
  await expect(page.locator('#terminal-message')).toContainText('Cycle detected. Period = 2.');
  await expect(page.locator('#history li strong')).toHaveText(['21', '22', '21']);
});

test('renames ternary variables inside arithmetic rules and supports multiplication precedence and unary signs', async ({ page }) => {
  await openTernary(page);
  const name = page.getByRole('textbox', { name: 'Variable 1 name', exact: true });
  await name.fill('Signal');
  await name.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Update rule for variable 1', exact: true })).toHaveValue('Signal + 1');
  await expect(page.getByRole('textbox', { name: 'Update rule for variable 2', exact: true })).toHaveValue('Signal');
  expect(await page.evaluate(() => window.__booleanLab.network.names)).toEqual(['Signal', 'B']);
  expect(await page.evaluate(() => window.__booleanLab.wiringGraph.cy.edges().map((edge) => `${edge.source().data('name')}->${edge.target().data('name')}`).sort())).toEqual(['Signal->B', 'Signal->Signal']);
  await page.getByRole('textbox', { name: 'Update rule for variable 1', exact: true }).fill('Signal + B * 2');
  await page.getByRole('textbox', { name: 'Update rule for variable 2', exact: true }).fill('-Signal');
  await page.locator('#apply-network').click();
  await expect(page.locator('#editor-error')).toBeHidden();
  await page.locator('#initial-state').fill('12');
  await page.locator('#step-button').click();
  await expectTernaryState(page, '22');
});

test('limits the ternary editor to five variables while generating all 243 states', async ({ page }) => {
  await openTernary(page);
  for (let count = 3; count <= 5; count += 1) await page.locator('#add-variable').click();
  await expect(page.locator('#variable-rows .variable-row')).toHaveCount(5);
  await expect(page.locator('#add-variable')).toBeDisabled();
  await page.locator('#apply-network').click();
  await expect(page.locator('#editor-error')).toBeHidden();
  await expect(page.locator('#state-count')).toHaveText('243 states');
  await expect.poll(() => page.evaluate(() => ({
    nodes: window.__booleanLab.phaseGraph.cy.nodes().length,
    edges: window.__booleanLab.phaseGraph.cy.edges().length,
    wiring: window.__booleanLab.wiringGraph.cy.nodes().length,
  }))).toEqual({ nodes: 243, edges: 243, wiring: 5 });
  await page.locator('.transition-details summary').click();
  await expect(page.locator('#transition-table tr')).toHaveCount(243);
  await expectTernaryState(page, '00000');
});

test('switches modules without leaving playback timers or losing applied rules, initial values, and unfinished drafts', async ({ page }) => {
  const first = page.getByRole('textbox', { name: 'Update rule for variable 1', exact: true });
  await first.fill('!A');
  await page.locator('#apply-network').click();
  await page.locator('#initial-state').fill('101');
  await page.locator('#play-button').click();
  expect(await page.evaluate(() => window.__booleanLab.simulation.playing)).toBe(true);
  await openTernary(page);
  expect(await page.evaluate(() => window.__booleanLab.simulation.playing)).toBe(false);
  await page.waitForTimeout(750);
  await expect(page.locator('#current-time')).toHaveText('t = 0');
  await page.locator('#initial-state').fill('22');
  await first.fill('B - 1');
  await expect(page.locator('#play-button')).toBeDisabled();
  await page.locator('#mode-boolean').click();
  await expect(page.getByRole('heading', { name: 'Boolean Network Simulator', exact: true })).toBeVisible();
  await expect(first).toHaveValue('!A');
  await expect(page.locator('#initial-state')).toHaveValue('101');
  await expect(page.locator('#example-select')).toHaveValue('custom');
  await expect(page.locator('#current-time')).toHaveText('t = 0');
  expect(await page.evaluate(() => window.__booleanLab.network.nextState('101'))).toBe('010');
  await first.fill('!Missing');
  await openTernary(page);
  await expect(first).toHaveValue('B - 1');
  await expect(page.locator('#initial-state')).toHaveValue('22');
  await expect(page.locator('#play-button')).toBeDisabled();
  expect(await page.evaluate(() => window.__booleanLab.network.nextState('22'))).toBe('02');
  await page.locator('#apply-network').click();
  await expect(page.locator('#editor-error')).toBeHidden();
  expect(await page.evaluate(() => window.__booleanLab.network.nextState('22'))).toBe('12');
  await page.locator('#mode-boolean').click();
  await expect(first).toHaveValue('!Missing');
  await expect(page.locator('#play-button')).toBeDisabled();
  expect(await page.evaluate(() => window.__booleanLab.network.variables[0].expression)).toBe('!A');
});

test('supports ternary mode on a narrow screen without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTernary(page);
  const [phase, wiring] = await Promise.all([
    page.locator('#phase-graph').boundingBox(),
    page.locator('#wiring-graph').boundingBox(),
  ]);
  expect(wiring.y).toBeGreaterThan(phase.y + phase.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('#initial-state').fill('12');
  await expectTernaryState(page, '12');
  await page.locator('#step-button').click();
  await expectTernaryState(page, '21');
  await page.locator('#mode-boolean').click();
  await expect(page.locator('#state-count')).toHaveText('8 states');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('opens the ternary module from a shared URL and explains modulo arithmetic in the guide', async ({ page }) => {
  await page.goto('/?module=ternary');
  await expect(page.getByRole('heading', { name: 'Ternary Network Simulator', exact: true })).toBeVisible();
  await expect(page.locator('#mode-ternary')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#state-count')).toHaveText('9 states');
  await page.locator('#guide-open').click();
  await expect(page.locator('#guide-dialog')).toBeVisible();
  await expect(page.locator('#guide-dialog')).toContainText('modulo 3');
  await expect(page.locator('#guide-dialog')).toContainText('red for 0, yellow for 1, and green for 2');
  await page.locator('#guide-close').click();
  await page.locator('#mode-boolean').click();
  expect(new URL(page.url()).searchParams.has('module')).toBe(false);
  await openTernary(page);
  expect(new URL(page.url()).searchParams.get('module')).toBe('ternary');
});

test('exports ternary values and the first repeated endpoint in the trajectory CSV', async ({ page }) => {
  await openTernary(page);
  for (let step = 0; step < 4; step += 1) await page.locator('#step-button').click();
  await expect(page.locator('#terminal-message')).toContainText('Period = 3');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-history').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('ternary-network-trajectory.csv');
  expect(await readFile(await download.path(), 'utf8')).toBe('time,state,A,B\n0,00,0,0\n1,10,1,0\n2,21,2,1\n3,02,0,2\n4,10,1,0\n');
});

test('renames a variable named inc without changing helper function identifiers', async ({ page }) => {
  await openTernary(page);
  const name = page.getByRole('textbox', { name: 'Variable 1 name', exact: true });
  const first = page.getByRole('textbox', { name: 'Update rule for variable 1', exact: true });
  const second = page.getByRole('textbox', { name: 'Update rule for variable 2', exact: true });
  await name.fill('inc');
  await name.press('Enter');
  await first.fill('inc(inc)');
  await second.fill('dec(inc)');
  await page.locator('#apply-network').click();
  await expect(page.locator('#editor-error')).toBeHidden();
  await name.fill('Signal');
  await name.press('Enter');
  await expect(first).toHaveValue('inc(Signal)');
  await expect(second).toHaveValue('dec(Signal)');
  await expect(page.locator('#editor-error')).toBeHidden();
  expect(await page.evaluate(() => window.__booleanLab.network.names)).toEqual(['Signal', 'B']);
  await page.locator('#initial-state').fill('12');
  await page.locator('#step-button').click();
  await expectTernaryState(page, '20');
});
