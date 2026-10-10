import './styles.css';
import { BooleanNetwork, MAX_VARIABLES } from './engine/network.js';
import { analyzePhaseSpace } from './engine/phase-space.js';
import { isVariableName } from './engine/parser.js';
import { EXAMPLES } from './examples.js';
import { PhaseGraph } from './graphs/phase-graph.js';
import { WiringGraph } from './graphs/wiring-graph.js';
import { SimulationController } from './simulation/controller.js';
import { icon } from './ui/icons.js';
import { template } from './ui/template.js';

const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
$('#app').innerHTML = template;

const phaseGraph = new PhaseGraph($('#phase-graph'));
const wiringGraph = new WiringGraph($('#wiring-graph'));
let network;
let analysis;
let draft = [];
let dirty = false;
let invalidInitialState = false;
let initialState = '';
const simulation = new SimulationController({
  onChange: renderSimulation,
  onPlaybackChange: renderPlayback,
});
simulation.setSpeed(Number($('#speed').value));

function errorMessage(id, message) {
  const element = $(id);
  element.textContent = message || '';
  element.hidden = !message;
}

function markDirty() {
  simulation.pause();
  dirty = true;
  $('#editor-status').textContent = 'Unapplied edits';
  $('#editor-status').classList.add('dirty');
  errorMessage('#editor-error', '');
  updateControlAvailability();
}

function updateControlAvailability() {
  const ended = Boolean(simulation.trajectory?.terminal);
  $('#play-button').disabled = dirty || invalidInitialState || ended;
  $('#step-button').disabled = dirty || invalidInitialState || ended || simulation.playing;
  $('#add-variable').disabled = draft.length >= MAX_VARIABLES;
}

function renderEditor() {
  $('#variable-rows').innerHTML = draft.map((variable, index) => `
    <div class="variable-row" data-index="${index}">
      <input class="variable-name mono" aria-label="Variable ${index + 1} name" data-field="name" value="${escapeHTML(variable.name)}" autocomplete="off" spellcheck="false" />
      <span class="rule-equals" aria-hidden="true">=</span>
      <input class="variable-expression mono" aria-label="Update rule for variable ${index + 1}" data-field="expression" value="${escapeHTML(variable.expression)}" autocomplete="off" spellcheck="false" />
      <button class="icon-button remove-variable" type="button" aria-label="Remove variable ${index + 1}" title="Remove ${escapeHTML(variable.name)}" ${draft.length === 1 ? 'disabled' : ''}>${icon('trash')}</button>
    </div>`).join('');
  updateControlAvailability();
}

function renderInitialControls() {
  invalidInitialState = false;
  $('#initial-state').value = initialState;
  $('#initial-state').setAttribute('aria-invalid', 'false');
  $('#initial-hint').textContent = `Bit order: ${network.names.join(' · ')}. Setting an initial state resets time to zero.`;
  $('#initial-toggles').innerHTML = network.names.map((name, index) => `
    <button type="button" class="bit-toggle" data-bit="${index}" aria-pressed="${initialState[index] === '1'}" aria-label="Initial value of ${escapeHTML(name)}: ${initialState[index]}">
      <span class="bit-name" title="${escapeHTML(name)}">${escapeHTML(name)}</span><span class="bit-value mono">${initialState[index]}</span>
    </button>`).join('');
  errorMessage('#initial-error', '');
}

function setInitialState(state) {
  try {
    network.validateState(state);
    initialState = state;
    renderInitialControls();
    simulation.reset(state);
    return true;
  } catch (error) {
    invalidInitialState = true;
    $('#initial-state').setAttribute('aria-invalid', 'true');
    errorMessage('#initial-error', error.message);
    updateControlAvailability();
    return false;
  }
}

/** Called exclusively after a valid network edit or loading an example. */
function applyNetwork(definitions, state) {
  const nextNetwork = new BooleanNetwork(definitions);
  nextNetwork.validateState(state);
  const changed = !network || nextNetwork.variables.some((variable, index) => variable.name !== network.variables[index]?.name || variable.expression !== network.variables[index]?.expression) || nextNetwork.size !== network.size;
  const nextAnalysis = changed ? analyzePhaseSpace(nextNetwork) : analysis;
  simulation.pause();
  network = nextNetwork;
  analysis = nextAnalysis;
  initialState = state;
  dirty = false;
  draft = definitions.map(({ name, expression }) => ({ name, expression, sourceName: name, referenceName: name }));
  if (changed) {
    phaseGraph.setNetwork(network, analysis);
    wiringGraph.setNetwork(network, state);
  }
  $('#variable-count').textContent = `${network.size} variable${network.size === 1 ? '' : 's'}`;
  $('#state-count').textContent = `${analysis.stateCount} states`;
  $('#attractor-count').textContent = `${analysis.attractors.length} attractor${analysis.attractors.length === 1 ? '' : 's'}`;
  $('#editor-status').textContent = 'Applied';
  $('#editor-status').classList.remove('dirty');
  errorMessage('#editor-error', '');
  renderEditor();
  renderInitialControls();
  renderAttractors();
  simulation.setNetwork(network, state);
}

function renderAttractors() {
  $('#attractor-list').innerHTML = analysis.attractors.map((attractor, index) => `
    <article class="attractor-item ${attractor.type}">
      <div class="attractor-heading"><span><i class="legend-dot ${attractor.type === 'fixed' ? 'fixed' : 'cycle'}"></i>${attractor.type === 'fixed' ? 'Fixed point' : `Periodic orbit · period ${attractor.period}`}</span><span class="basin-label">Basin ${index + 1}</span></div>
      <div class="orbit-states mono">${attractor.states.map((state) => `<span>${state}</span>`).join('<span class="orbit-arrow">→</span>')}${attractor.type === 'cycle' ? '<span class="orbit-arrow">↻</span>' : ''}</div>
      <div class="basin-bar" role="img" aria-label="${attractor.basinSize} of ${analysis.stateCount} states in basin"><span style="width: ${100 * attractor.basinSize / analysis.stateCount}%"></span></div>
      <p>${attractor.basinSize} of ${analysis.stateCount} states <span>· ${Math.round(100 * attractor.basinSize / analysis.stateCount)}% of phase space</span></p>
    </article>`).join('');
  const basinIndices = new Map(analysis.attractors.map((attractor, index) => [attractor.id, index + 1]));
  $('#transition-count').textContent = `(${analysis.stateCount})`;
  $('#transition-table').innerHTML = analysis.states.map((state) => `
    <tr><td class="mono">${state.state}</td><td class="mono">${state.successor}</td><td>Basin ${basinIndices.get(state.attractorId)}${state.isFixedPoint ? ' · fixed point' : state.isAttractor ? ' · periodic orbit' : ''}</td><td>${state.depth}</td></tr>`).join('');
}

/** Playback has access only to wiringGraph, never phaseGraph. */
function renderSimulation(trajectory) {
  wiringGraph.setState(trajectory.currentState);
  $('#current-time').textContent = `t = ${trajectory.time}`;
  $('#current-state').textContent = trajectory.currentState;
  $('#wiring-state-note').textContent = `x(${trajectory.time})`;
  $('#wiring-graph').setAttribute('aria-label', `Current wiring state at time ${trajectory.time}: ${network.names.map((name, index) => `${name} equals ${trajectory.currentState[index]}`).join(', ')}. Nodes can be dragged.`);
  const terminal = trajectory.terminal;
  const cycleStart = terminal?.entryTime;
  $('#history').innerHTML = trajectory.history.map((entry, index) => {
    const orbitState = terminal && index >= cycleStart && index < trajectory.time;
    const repeat = terminal && index === trajectory.time;
    return `<li class="history-entry ${orbitState ? 'in-orbit' : ''} ${repeat ? 'repeated' : ''}" ${index === trajectory.time ? 'aria-current="step"' : ''}>
      <span class="history-time">t = ${entry.time}</span><strong class="mono">${entry.state}</strong>${repeat ? '<span class="history-tag">repeat</span>' : ''}
    </li>`;
  }).join('');
  $('#history').scrollLeft = $('#history').scrollWidth;
  $('#history-description').textContent = `${trajectory.history.length} visited state${trajectory.history.length === 1 ? '' : 's'} · variable order ${network.names.join(', ')}`;
  let title = simulation.playing ? 'Simulation running' : trajectory.time ? 'Simulation paused' : 'Ready to explore';
  let description = trajectory.time ? 'Continue playing or advance a single step.' : 'Play or advance one synchronous step.';
  let message = '';
  if (terminal?.type === 'fixed') {
    title = 'Fixed point reached';
    description = `State ${terminal.states[0]} is unchanged by every subsequent update.`;
    message = `Fixed point: ${terminal.states[0]}. Reached at t = ${terminal.entryTime}, confirmed at t = ${trajectory.time}.`;
  } else if (terminal?.type === 'cycle') {
    title = `Periodic orbit · period ${terminal.period}`;
    description = `First repeated state at t = ${trajectory.time}; the orbit begins at t = ${terminal.entryTime}.`;
    message = `Cycle detected. Period = ${terminal.period}. Orbit: ${terminal.states.join(' → ')} → ${terminal.states[0]}.`;
  }
  $('#simulation-status').className = `simulation-status ${terminal?.type || ''}`;
  $('#simulation-status').innerHTML = `<span class="status-symbol">${terminal ? '↻' : '↗'}</span><div><strong>${title}</strong><p>${description}</p></div>`;
  $('#terminal-message').hidden = !terminal;
  $('#terminal-message').textContent = message;
  updateControlAvailability();
}

function renderPlayback() {
  const playing = simulation.playing;
  $('#play-button').innerHTML = `${icon(playing ? 'pause' : 'play')}<span>${playing ? 'Pause' : 'Play'}</span>`;
  if (simulation.trajectory) renderSimulation(simulation.trajectory);
}

$('#example-select').innerHTML = EXAMPLES.map((example) => `<option value="${example.id}">${escapeHTML(example.name)}</option>`).join('') + '<option value="custom" disabled>Custom network</option>';
$('#example-select').addEventListener('change', (event) => {
  const example = EXAMPLES.find(({ id }) => id === event.target.value);
  if (example) applyNetwork(example.variables, example.initialState);
});

$('#variable-rows').addEventListener('input', (event) => {
  const field = event.target.dataset.field;
  if (!field) return;
  const index = Number(event.target.closest('.variable-row').dataset.index);
  draft[index][field] = event.target.value;
  markDirty();
});
function commitRenames() {
  // Keep the last valid identifier across invalid edits and Enter submission.
  // Replace every token once so simultaneous renames cannot cascade.
  const renames = new Map();
  draft.forEach((row, index) => {
    if (row.referenceName && row.name !== row.referenceName && isVariableName(row.name) && !draft.some((other, i) => i !== index && other.name === row.name)) {
      renames.set(row.referenceName, row.name);
      row.referenceName = row.name;
    }
  });
  if (!renames.size) return;
  const rows = [...$('#variable-rows').children];
  draft.forEach((row, index) => {
    row.expression = row.expression.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (name) => renames.get(name) || name);
    rows[index].querySelector('[data-field="expression"]').value = row.expression;
  });
}
$('#variable-rows').addEventListener('change', (event) => {
  if (event.target.dataset.field === 'name') commitRenames();
});
$('#variable-rows').addEventListener('click', (event) => {
  const button = event.target.closest('.remove-variable');
  if (!button || draft.length === 1) return;
  const index = Number(button.closest('.variable-row').dataset.index);
  draft.splice(index, 1);
  markDirty();
  renderEditor();
  $('#variable-rows').children[Math.min(index, draft.length - 1)].querySelector('input').focus();
});
$('#add-variable').addEventListener('click', () => {
  if (draft.length >= MAX_VARIABLES) return;
  const used = new Set(draft.map(({ name }) => name));
  const name = 'ABCDEFGH'.split('').find((candidate) => !used.has(candidate)) || `X${draft.length + 1}`;
  draft.push({ name, expression: '0', sourceName: null, referenceName: name });
  markDirty();
  renderEditor();
  $('#variable-rows').lastElementChild.querySelector('input').focus();
});
$('#network-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    commitRenames();
    const previous = new Map(network.names.map((name, index) => [name, initialState[index]]));
    const state = draft.map(({ sourceName }) => previous.get(sourceName) || '0').join('');
    applyNetwork(draft.map(({ name, expression }) => ({ name, expression })), state);
    $('#example-select').value = 'custom';
  } catch (error) {
    simulation.pause();
    errorMessage('#editor-error', error.message);
    $('#editor-status').textContent = 'Check rules';
  }
});

$('#initial-state').addEventListener('input', (event) => {
  simulation.pause();
  const state = event.target.value;
  if (state.length === network.size && /^[01]+$/.test(state)) setInitialState(state);
  else {
    invalidInitialState = true;
    $('#initial-state').setAttribute('aria-invalid', 'true');
    errorMessage('#initial-error', `Enter exactly ${network.size} binary digits (0 or 1).`);
    updateControlAvailability();
  }
});
$('#initial-state').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); setInitialState(event.target.value); }
});
$('#set-initial').addEventListener('click', () => setInitialState($('#initial-state').value));
$('#initial-toggles').addEventListener('click', (event) => {
  const button = event.target.closest('[data-bit]');
  if (!button) return;
  const bits = [...initialState];
  const index = Number(button.dataset.bit);
  bits[index] = bits[index] === '1' ? '0' : '1';
  setInitialState(bits.join(''));
  $('#initial-toggles').querySelector(`[data-bit="${index}"]`).focus();
});
$('#play-button').addEventListener('click', () => simulation.playing ? simulation.pause() : simulation.play());
$('#step-button').addEventListener('click', () => simulation.step());
$('#reset-button').addEventListener('click', () => {
  renderInitialControls();
  simulation.reset(initialState);
});
$('#speed').addEventListener('input', (event) => {
  const value = Number(event.target.value);
  simulation.setSpeed(value);
  $('#speed-output').textContent = `${value.toFixed(1)} steps/s`;
});
document.querySelectorAll('[data-view]').forEach((button) => {
  const graph = button.dataset.graph === 'phase' ? phaseGraph : wiringGraph;
  button.addEventListener('click', () => {
    if (button.dataset.view === 'fit') graph.fit();
    else if (button.dataset.view === 'in') graph.zoomIn();
    else graph.zoomOut();
  });
});
$('#guide-open').addEventListener('click', () => $('#guide-dialog').showModal());
$('#guide-close').addEventListener('click', () => $('#guide-dialog').close());
$('#guide-dialog').addEventListener('click', (event) => {
  if (event.target !== $('#guide-dialog')) return;
  const bounds = event.target.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.target.close();
});
$('#export-history').addEventListener('click', () => {
  const header = ['time', 'state', ...network.names].join(',');
  const rows = simulation.trajectory.history.map(({ time, state }) => [time, state, ...state].join(','));
  const blob = new Blob([header, '\n', rows.join('\n'), '\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'boolean-network-trajectory.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('pagehide', () => simulation.pause());

applyNetwork(EXAMPLES[0].variables, EXAMPLES[0].initialState);
// Browser integration tests inspect actual graph instances, not a second graph model.
if (import.meta.env.DEV) window.__booleanLab = { phaseGraph, wiringGraph, simulation, get network() { return network; } };
