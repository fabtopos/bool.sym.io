import { BooleanNetwork, MAX_VARIABLES } from './engine/network.js';
import { TernaryNetwork, MAX_TERNARY_VARIABLES } from './engine/ternary-network.js';
import { EXAMPLES } from './examples.js';
import { TERNARY_EXAMPLES } from './ternary-examples.js';

/** Each module declares its domain and parser; graph and playback code is shared. */
export const MODULES = {
  boolean: {
    id: 'boolean',
    title: 'Boolean Network Simulator',
    Network: BooleanNetwork,
    radix: 2,
    maxVariables: MAX_VARIABLES,
    examples: EXAMPLES,
    domain: '{0, 1}',
    inputLabel: 'Binary state',
    orderLabel: 'Bit order',
    limit: '1–8 variables · up to 256 states. The phase space grows as 2ⁿ.',
    syntax: '<span class="syntax-title">OPERATORS</span><code>!</code> NOT <code>&amp;&amp;</code> AND <code>^</code> XOR <code>||</code> OR <span class="syntax-constants">Constants <code>0</code> <code>1</code></span>',
    ruleNote: '',
    legend: '<span><i class="legend-dot on"></i>1 · ON</span><span><i class="legend-dot off"></i>0 · OFF</span><span class="edge-legend">↗ Dependency</span>',
    guideIntro: 'A Boolean network has variables that are either 0 or 1. At each step, all update rules read the same old state, and all variables change simultaneously.',
    guideWiring: 'The wiring diagram connects a variable to each rule that references it. Its nodes show the current state: green for 1, red for 0. Drag the nodes to make the layout your own.',
    guideRules: 'Operator precedence, from highest to lowest: <code>!</code>, <code>&amp;&amp;</code>, <code>^</code>, <code>||</code>. Use parentheses to group expressions. Constants are <code>0</code> and <code>1</code>.',
  },
  ternary: {
    id: 'ternary',
    title: 'Ternary Network Simulator',
    Network: TernaryNetwork,
    radix: 3,
    maxVariables: MAX_TERNARY_VARIABLES,
    examples: TERNARY_EXAMPLES,
    domain: '{0, 1, 2}',
    inputLabel: 'Ternary state',
    orderLabel: 'Variable order',
    limit: '1–5 variables · up to 243 states. The phase space grows as 3ⁿ.',
    syntax: '<span class="syntax-title">OPERATORS</span><code>+</code> ADD <code>-</code> SUBTRACT <code>*</code> MULTIPLY <span class="syntax-constants">Constants <code>0</code> <code>1</code> <code>2</code></span>',
    ruleNote: 'Every calculation wraps modulo 3. A + 1 cycles 0 → 1 → 2 → 0; 0 − 1 becomes 2.',
    legend: '<span><i class="legend-dot off"></i>0 · RED</span><span><i class="legend-dot middle"></i>1 · YELLOW</span><span><i class="legend-dot on"></i>2 · GREEN</span><span class="edge-legend">↗ Dependency</span>',
    guideIntro: 'A ternary network has variables taking values 0, 1, or 2. At each step, all update rules read the same old state, and all variables change simultaneously. Each arithmetic result is reduced modulo 3.',
    guideWiring: 'The wiring diagram connects a variable to each rule that references it. Its nodes show the current state: red for 0, yellow for 1, and green for 2. Drag the nodes to make the layout your own.',
    guideRules: 'Use <code>+</code>, <code>-</code>, <code>*</code>, and parentheses. Unary signs bind first, then multiplication, then addition and subtraction. Every result wraps into 0, 1, or 2: <code>2 + 1 = 0</code>, <code>0 - 1 = 2</code>, <code>2 * 2 = 1</code>. Write <code>A + 1</code> to cycle the values; the modulo operation is automatic.',
  },
};
