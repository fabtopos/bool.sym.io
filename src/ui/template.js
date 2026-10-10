import { icon } from './icons.js';

function viewportControls(graph) {
  return `<div class="viewport-controls" aria-label="${graph === 'phase' ? 'Phase space' : 'Wiring diagram'} view controls">
    <button type="button" class="icon-button" data-graph="${graph}" data-view="in" aria-label="Zoom in ${graph} graph" title="Zoom in">${icon('plus')}</button>
    <button type="button" class="icon-button" data-graph="${graph}" data-view="out" aria-label="Zoom out ${graph} graph" title="Zoom out">${icon('minus')}</button>
    <span class="control-divider"></span>
    <button type="button" class="icon-button" data-graph="${graph}" data-view="fit" aria-label="Reset ${graph} graph view" title="Fit graph to view">${icon('fit')}</button>
  </div>`;
}

export const template = `
<header class="site-header">
  <a class="brand" href="./" aria-label="bool.sym.io home"><span class="brand-mark">${icon('network')}</span>bool<span class="brand-dot">.</span>sym<span class="brand-dot">.</span>io</a>
  <span class="header-caption">A SMALL LAB FOR DISCRETE DYNAMICS</span>
  <button id="guide-open" class="button button-quiet">${icon('help')}<span>Quick guide</span></button>
</header>
<main class="workspace">
  <section class="intro" aria-labelledby="app-title">
    <div><div class="eyebrow">EXPLORE THE DYNAMICS</div><h1 id="app-title">Boolean Network Simulator</h1><p class="intro-copy">A complete map of possibilities. One evolving state.</p></div>
    <div class="example-picker"><label for="example-select">START WITH AN EXAMPLE</label><select id="example-select"></select></div>
  </section>

  <div class="module-toolbar"><div class="module-switch" role="group" aria-label="Network module"><span class="module-label">MODULE</span><button id="mode-boolean" type="button" aria-pressed="true">Boolean <span>0 / 1</span></button><button id="mode-ternary" type="button" aria-pressed="false">Ternary <span>0 / 1 / 2</span></button></div><p id="module-description">Your rules are remembered in each module.</p></div>

  <div class="network-summary"><div class="summary-items"><span id="variable-count"></span><span id="state-count"></span><span id="attractor-count"></span></div><span class="sync-label"><span class="small-square"></span>Synchronous updates</span></div>

  <section class="visualizations" aria-label="Boolean network visualizations">
    <article class="graph-panel">
      <div class="panel-heading"><div class="panel-title"><span class="panel-number">01</span><div><h2>Phase Space Graph</h2><p>Every state. Every transition.</p></div></div><span class="panel-badge">STATIC MAP</span></div>
      <div class="graph-stage"><div id="phase-graph" class="graph-canvas" role="img" aria-label="Complete static phase space. Use the transition table below for a text equivalent."></div>${viewportControls('phase')}<span class="canvas-note" id="phase-domain-note">F : {0, 1}ⁿ → {0, 1}ⁿ</span></div>
      <div class="graph-footer"><div class="legend"><span><i class="legend-dot transient"></i>Transient</span><span><i class="legend-dot cycle"></i>Periodic orbit</span><span><i class="legend-dot fixed"></i>Fixed point</span></div><span class="graph-hint">Scroll to zoom · drag to pan</span></div>
    </article>
    <article class="graph-panel">
      <div class="panel-heading"><div class="panel-title"><span class="panel-number">02</span><div><h2>Wiring Diagram</h2><p>Variables and their dependencies.</p></div></div><span class="panel-badge live-badge"><span></span>LIVE STATE</span></div>
      <div class="graph-stage"><div id="wiring-graph" class="graph-canvas" role="img" aria-label="Wiring diagram showing current Boolean values. The variable controls below provide a text equivalent."></div>${viewportControls('wiring')}<span class="canvas-note" id="wiring-state-note">x(0)</span></div>
      <div class="graph-footer"><div class="legend" id="wiring-legend"><span><i class="legend-dot on"></i>1 · ON</span><span><i class="legend-dot off"></i>0 · OFF</span><span class="edge-legend">↗ Dependency</span></div><span class="graph-hint">Drag nodes to arrange</span></div>
    </article>
  </section>

  <section class="transport card" aria-label="Simulation controls">
    <div class="transport-buttons"><button id="play-button" class="button button-primary">${icon('play')}<span>Play</span></button><button id="step-button" class="button button-secondary">${icon('step')}<span>Next step</span></button><button id="reset-button" class="button button-quiet">${icon('reset')}<span>Reset</span></button></div>
    <div class="current-readout" role="status" aria-live="polite"><span class="readout-label">TIME</span><strong id="current-time">t = 0</strong><span class="readout-separator"></span><span class="readout-label">STATE</span><strong id="current-state" class="mono">000</strong></div>
    <div class="speed-control"><label for="speed">Speed <output id="speed-output" for="speed">1.5 steps/s</output></label><input id="speed" type="range" min="0.5" max="5" step="0.5" value="1.5" /></div>
  </section>

  <div class="configuration-grid">
    <section class="card editor-card" aria-labelledby="editor-heading">
      <div class="section-heading"><div><h2 id="editor-heading">Define your network</h2><p>Each rule is evaluated using the previous state.</p></div><span id="editor-status" class="subtle-tag">Applied</span></div>
      <form id="network-form" novalidate><div class="editor-column-labels"><span>VARIABLE</span><span>UPDATE RULE</span></div><div id="variable-rows"></div>
        <div class="editor-actions"><button type="button" id="add-variable" class="button button-quiet">${icon('plus')}Add variable</button><button type="submit" id="apply-network" class="button button-secondary">${icon('check')}Apply network</button></div>
      </form>
      <p id="editor-error" class="error-message" role="alert" hidden></p>
      <div class="syntax-help"><span class="syntax-title">OPERATORS</span><code>!</code> NOT <code>&amp;&amp;</code> AND <code>^</code> XOR <code>||</code> OR <span class="syntax-constants">Constants <code>0</code> <code>1</code></span></div>
      <p id="rule-semantics" class="rule-semantics" hidden></p>
      <p class="limit-note">1–8 variables · up to 256 states. The phase space grows as 2ⁿ.</p>
    </section>

    <section class="card initial-card" aria-labelledby="initial-heading">
      <div class="section-heading"><div><h2 id="initial-heading">Initial configuration</h2><p>Choose where your trajectory begins.</p></div><span class="subtle-tag">x(0)</span></div>
      <div class="initial-input-row"><label for="initial-state">Binary state</label><input id="initial-state" class="mono" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" aria-describedby="initial-hint initial-error" /><button id="set-initial" class="button button-secondary">Set state</button></div>
      <p id="initial-hint" class="field-hint"></p><p id="initial-error" class="error-message" role="alert" hidden></p>
      <div id="initial-toggles" class="initial-toggles" aria-label="Initial variable values"></div>
      <div id="simulation-status" class="simulation-status" role="status" aria-live="polite"><span class="status-symbol">↗</span><div><strong>Ready to explore</strong><p>Play or advance one synchronous step.</p></div></div>
      <p class="static-reminder">Only the wiring diagram changes during simulation.<br>The phase space stays exactly as you left it.</p>
    </section>
  </div>

  <section class="card trajectory-card" aria-labelledby="history-heading"><div class="section-heading"><div><h2 id="history-heading">Trajectory</h2><p id="history-description">The visited states, in order.</p></div><button id="export-history" class="button button-quiet">${icon('download')}Export CSV</button></div><ol id="history" class="history-list" aria-label="Simulation history"></ol><div id="terminal-message" class="terminal-message" role="status" hidden></div></section>

  <section class="card attractors-card" aria-labelledby="attractors-heading"><div class="section-heading"><div><h2 id="attractors-heading">Attractors &amp; basins</h2><p>Long-term behavior across the complete state space.</p></div><span class="subtle-tag">Global analysis</span></div><div id="attractor-list" class="attractor-list"></div><details class="transition-details"><summary>Explore all state transitions <span id="transition-count"></span></summary><div class="transition-table-wrap"><table><caption class="sr-only">Every state and its synchronous successor, basin, and distance to its attractor</caption><thead><tr><th scope="col">State</th><th scope="col">Next state</th><th scope="col">Attractor</th><th scope="col">Steps to attractor</th></tr></thead><tbody id="transition-table"></tbody></table></div></details></section>

  <footer class="site-footer"><span>bool.sym.io <span class="footer-divider">/</span> A finite state space. An open field of possibilities.</span><a href="https://github.com/fabtopos/bool.sym.io" target="_blank" rel="noreferrer">Source on GitHub ↗</a></footer>
</main>

<dialog id="guide-dialog" aria-labelledby="guide-title">
  <div class="dialog-heading"><h2 id="guide-title">A quick guide to Boolean dynamics</h2><button id="guide-close" class="icon-button" aria-label="Close guide">×</button></div>
  <p id="guide-intro"></p>
  <div class="math-line">xᵢ(t + 1) = fᵢ(x₁(t), …, xₙ(t))</div>
  <p><strong>The phase space</strong> maps every possible state and its single successor. Amber nodes are fixed points; violet nodes form periodic orbits. A basin contains all states that eventually reach the same attractor. This map stays static while you simulate.</p>
  <p id="guide-wiring"></p>
  <p>Edit rules, then select <strong>Apply network</strong>. Renaming a variable updates references in the other draft rules. A deleted variable must also be removed from rules that reference it.</p>
  <p>Names may contain letters, numbers, and underscores, and must start with a letter or underscore. Names are case sensitive. The digit order is the row order in the editor.</p>
  <p id="guide-rules"></p>
  <p>Select a module to work with Boolean or ternary values. Each module remembers its rules and initial configuration for this visit. Switching modules pauses playback and starts the selected network at time zero.</p>
  <p>The trajectory stops on its first repeated state. A fixed point is reported separately; a periodic orbit lists its distinct states and period. Reset returns to your chosen initial configuration.</p>
  <form method="dialog"><button class="button button-primary">Start exploring</button></form>
</dialog>
`;
