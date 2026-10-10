# bool.sym.io — Boolean and Ternary Network Simulator

A browser application for exploring synchronous Boolean and ternary networks. Choose the **Boolean · 0 / 1** or **Ternary · 0 / 1 / 2** module, build a network, inspect every possible transition, and play its trajectory from any initial configuration.

**Left: a static phase space graph of the complete dynamics. Right: a wiring diagram whose nodes change color as the state evolves.** Playback never changes the phase space graph's nodes, edges, labels, layout, or colors, and never highlights the current state there. Boolean wiring nodes use **0 = red, 1 = green**. Ternary wiring nodes use **0 = red, 1 = yellow, 2 = green**.

Each module remembers its applied rules, initial configuration, and unfinished editor draft while the page is open. Switching modules pauses playback and starts the selected module at time zero. Reloading the page restores the built-in defaults.

To open the ternary module directly, append `?module=ternary` to the application URL, for example [the ternary simulator on GitHub Pages](https://fabtopos.github.io/bool.sym.io/?module=ternary). Switching modules updates this URL so the selected module can be shared.

The application uses vanilla JavaScript, Vite, and Cytoscape.js. It runs entirely in the browser and builds into static files suitable for GitHub Pages. No server or account is needed to simulate a network.

## Run locally

Install [Node.js](https://nodejs.org/) 22.12 or newer; Node 24 is recommended and used by the deployment workflow. From the existing repository directory:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`. To produce and inspect the production build:

```sh
npm run build
npm run preview
```

The production files are written to `dist/`. Serve these files over HTTP; opening `index.html` directly from the filesystem does not provide the same module loading environment. `npm run preview` is a local preview server. See [Vite's static deployment documentation](https://vite.dev/guide/static-deploy.html).

## Mathematics

For an ordered list of variables $x_1,\ldots,x_n$, a Boolean state is a vector $x\in\{0,1\}^n$; a ternary state is a vector $x\in\{0,1,2\}^n$. Each update function $f_i$ takes the entire current vector as input and returns one value from the selected domain. The synchronous global transition is

$$
F(x) = \bigl(f_1(x),\ldots,f_n(x)\bigr),\qquad x(t+1)=F(x(t)).
$$

Every function reads the **same previous state**; variables never update in place one at a time. The order of the editor rows determines the state string order: the first variable is the leftmost digit. For rows `A, B, C`, Boolean `101` means `A = 1`, `B = 0`, and `C = 1`; ternary `201` means `A = 2`, `B = 0`, and `C = 1`.

There are $2^n$ Boolean states or $3^n$ ternary states. Each state has exactly one outgoing transition, so every trajectory eventually reaches a fixed point or a periodic orbit. The full phase space is a collection of components, each containing one attractor and the states feeding into it, called its basin of attraction. Basin sizes include the attractor's own states.

A fixed point satisfies $F(x)=x$. If a new state instead repeats a state first visited at time $s$, and the new time is $t$, the orbit has period $t-s$. Its states are the entries from time $s$ through $t-1$. The duplicate endpoint is shown in the history but counted only once in the orbit.

The controller stops on the **first repeated state**, including a return to the initial state. It checks for equality with the immediately preceding state first and reports a **fixed point** separately from a longer periodic orbit. A trajectory has at most $2^n+1$ Boolean or $3^n+1$ ternary history entries when the final repeated endpoint is included.

## Create and edit a network

Load a built-in example or edit the variable rows. Add and remove rows, rename variables, and enter one update expression per variable. Apply the network to validate all rows and rebuild both graphs when the definitions change. Validation errors identify the affected row and explain malformed expressions, duplicate names, or references to unknown variables. The active network is replaced only after the complete draft validates.

Editing the draft pauses playback. Play and Next Step become available again after the draft is applied successfully, so the graphs and simulated rules always represent the same applied network.

Variable names are case sensitive. They must begin with a letter or underscore and then contain only letters, digits, or underscores: `[A-Za-z_][A-Za-z0-9_]*`. Each name must be unique. A successful rename updates references to that variable in the draft expressions. Removing a variable can leave unknown references that must be repaired before applying the draft.

Boolean expressions support the following operators, in order from highest to lowest precedence:

| Syntax | Meaning | Example |
| --- | --- | --- |
| `!` | NOT | `!A` |
| `&&` | AND | `A && B` |
| `^` | XOR: true when the two operands differ | `A ^ B` |
| `||` | OR | `A || B` |

Parentheses override precedence, and `0` and `1` are Boolean constants. For example, `!A && B ^ C || 1` parses as `((!A && B) ^ C) || 1`. Write only the expression in each update field; the variable name is in its own field.

```text
A = !B
B = A && C
C = A || B
```

### Ternary expressions

The ternary module uses **arithmetic modulo 3**. Every operation is reduced to one of `{0, 1, 2}`: after `2`, addition wraps back to `0`, and negative results wrap into the same domain. These arithmetic rules define a finite dynamical system over the field with three elements.

| Syntax | Ternary meaning | Example |
| --- | --- | --- |
| `A + B` | Addition modulo 3 | `2 + 2 = 1` |
| `A - B` | Subtraction modulo 3 | `0 - 1 = 2` |
| `A * B` | Multiplication modulo 3 | `2 * 2 = 1` |
| `-A` | Additive inverse modulo 3 | `-0 = 0`, `-1 = 2`, `-2 = 1` |
| `+A` | Unary plus | `+2 = 2` |

Constants are `0`, `1`, and `2`. Unary signs have highest precedence, followed by `*`, then `+` and `-`. Operators at the same precedence associate left to right. Parentheses override precedence. For example, `A + B * C` means `A + (B * C)`; `A - B - C` means `(A - B) - C`. The rule `A = A + 1` creates a period-three orbit from every initial value. The ternary parser rejects Boolean operators such as `!` and `&&`; Boolean rules retain their original semantics in their own module.

The optional helpers `inc(expression)` and `dec(expression)` mean adding or subtracting `1` modulo 3. They accept one complete subexpression; all other function calls are rejected.

Both parsers tokenize expressions into a syntax tree. Expressions are never passed to `eval()`, the `Function` constructor, or another JavaScript execution mechanism. JavaScript statements, arbitrary function calls, division, powers, and comparison operators are not part of the grammar.

An expression may contain at most 4,096 characters, with at most 256 levels of nesting. These bounds keep malformed or excessively deep input from exhausting the parser's stack.

## Explore the two graphs

### Phase Space Graph

Every vertex is a state string in the selected domain, and every arrow is the synchronous transition $x\to F(x)$. Fixed points have self loops; periodic attractors form directed cycles. Separate visual treatments identify fixed points, cycle states, and transient states, with basins arranged around their attractors. The phase graph uses its own visual scheme; wiring value colors never indicate the current state in this graph.

The graph is generated when an applied network's variable names or update expressions change, including when loading a different example or switching modules. Applying identical definitions within the same module preserves the graph and its viewport. Editing the initial state, stepping, playing, pausing, and resetting the simulation leave it unchanged. Use the panel's zoom, pan, and view reset controls to inspect dense regions. The graph layout itself is not animated during simulation.

The **Attractors & basins** section lists every attractor, its orbit, and its basin size. Expand **Explore all state transitions** for a text table containing every state, its successor, its attractor, and the number of steps needed to enter that attractor. This table provides the same complete dynamics independently of the graph canvas.

### Wiring Diagram

Every vertex is a variable. An arrow `A → B` means that `A` appears in `B`'s update expression; repeated references produce one dependency arrow. A variable that reads itself has a self loop. These arrows indicate expression references, without claiming a positive or negative influence or removing references through algebraic simplification.

Nodes show their name and current value. In Boolean mode, **green is 1 (ON), red is 0 (OFF)**. In ternary mode, **red is 0, yellow is 1, green is 2**. Colors change smoothly as the simulation advances. The diagram is created once per network and its node positions remain stable during simulation. Zoom, pan, and drag variables to arrange the graph.

The desktop view shows the two panels side by side. They stack on narrow screens. Each panel includes a legend and controls for inspecting its graph.

## Initial states and simulation

Enter a state string with exactly one digit per variable, or use the individual variable controls. Boolean controls toggle `0 ↔ 1`; ternary controls cycle `0 → 1 → 2 → 0`. These controls stay synchronized. A valid change sets a new initial configuration, clears the previous trajectory, and immediately updates the wiring diagram's values. Ternary strings may contain only `0`, `1`, and `2`, while Boolean strings may contain only `0` and `1`.

| Control | Behavior |
| --- | --- |
| Play | Advance automatically until a fixed point or repeated state is reached. |
| Pause | Stop playback while retaining the current state and history. |
| Next Step | Apply one synchronous transition and check terminal behavior. |
| Reset | Return to the selected initial configuration at time `t = 0`. |
| Speed | Set the interval between automatic updates. |

The current time and state appear beside the controls. The trajectory history records each step, and the result identifies a fixed point or the period and states of a periodic orbit. Reset to start another run after termination. Pausing, resetting, loading an example, changing the initial state, and applying a network cleanly stop playback. Only one playback timer can be active at a time.

Use **Export CSV** to download the displayed trajectory, including time, state string, and individual variable values. The final repeated state is retained in the export.

## Built-in examples

### Boolean module

| Example | Update functions | Dynamics |
| --- | --- | --- |
| Inverting ring (default) | `A = !C`, `B = A`, `C = B` | Period-six orbit from `000`; the other two states form a period-two orbit. |
| Convergent cascade | `A = 1`, `B = A`, `C = B` | Every state reaches fixed point `111`; its basin contains all eight states. |
| Multiple attractors | `A = A`, `B = A && C`, `C = B` | Fixed points `000`, `100`, and `111`, plus the period-two orbit `101 ↔ 110`. Their basin sizes are 4, 1, 1, and 2 respectively. |

The default inverting ring starts at `000` and follows

```text
000 → 100 → 110 → 111 → 011 → 001 → 000
```

Its second orbit is `010 → 101 → 010`. The full phase space displays both attractors regardless of the selected initial configuration. The examples' advertised behavior is checked by the automated mathematical tests.

### Ternary module

| Example | Update functions | Dynamics |
| --- | --- | --- |
| Three-state clock (default) | `A = A + 1`, `B = A` | From `00`, one transient step leads to the period-three orbit `10 → 21 → 02 → 10`. All nine states share this attractor. |
| Convergent cascade | `A = 2`, `B = A`, `C = B` | Every state reaches fixed point `222`; its basin contains all 27 states. |
| Multiple attractors | `A = A`, `B = A * B` | Five fixed points `00`, `10`, `11`, `12`, `20`, plus the period-two orbit `21 ↔ 22`. Their basin sizes are 3, 1, 1, 1, 1, and 2 respectively. The default initial state `02` reaches `00`. |

The full phase space and global analysis show every attractor and basin, independently of the chosen initial state.

## Size and performance

The Boolean module supports **1–8 variables**, displaying all **2–256 states** and their transitions. The ternary module supports **1–5 variables**, displaying all **3–243 states** and their transitions. A sixth ternary variable would produce 729 states, so larger networks are rejected with an explanation before graph generation. Use zoom and pan to inspect larger accepted graphs.

The mathematical calculations are separate from Cytoscape rendering. Larger networks could be supported later through partial state space exploration, sampling, or computation in a worker; this version always shows the complete finite dynamics for accepted networks.

## Project structure

| Module | Responsibility |
| --- | --- |
| `src/engine/parser.js` | Safe expression parsing, precedence, evaluation, and dependencies. |
| `src/engine/network.js` | Ordered variables, validation, and synchronous transitions. |
| `src/engine/ternary-parser.js` | Safe arithmetic expressions modulo 3 and dependency extraction. |
| `src/engine/ternary-network.js` | Ternary variables, state validation, and synchronous transitions. |
| `src/engine/phase-space.js` | Complete state space, attractors, basins, and transient depths. |
| `src/engine/trajectory.js` | History and first-repeat termination. |
| `src/simulation/controller.js` | Playback, pause, reset, speed, and timer ownership. |
| `src/graphs/` | Static phase space rendering and animated wiring rendering. |
| `src/ui/` and `src/main.js` | Interface, editor, and application state. |
| `src/examples.js` | Validated built-in network definitions. |
| `src/ternary-examples.js` | Validated built-in three-state networks. |

The simulation controller has no graph references. The phase renderer exposes network and viewport operations; the wiring renderer additionally exposes a state update that preserves nodes and their positions.

## Tests

```sh
npm test
```

Vitest checks Boolean and ternary parsing and precedence, safe input validation, synchronous transitions, complete phase space generation, wiring dependencies, fixed points, periodic orbits, basin assignment, and termination on the first repeated state. Browser tests also check module switching, the three wiring colors, synchronized initial states, and preservation of the static phase graph during ternary playback. For interactive unit test development:

```sh
npm run test:watch
```

Browser smoke tests use Playwright and Chromium. Install its browser once, then run the suite:

```sh
npx playwright install chromium
npm run test:browser
```

On Linux machines missing browser system libraries, use `npx playwright install --with-deps chromium`. The browser test configuration starts the application server automatically. See [Playwright's installation documentation](https://playwright.dev/docs/intro).

To check the compiled artifact itself, including relative assets at both a domain root and a GitHub Pages project path:

```sh
npm run build
npm run test:production
```

This check serves only `dist/` and verifies rendering, synchronous stepping, reset, and automatic cycle termination in Chromium.

## GitHub Pages

The workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs on pushes to `main` and can also be started manually. It installs the locked dependencies with `npm ci`, runs unit tests, builds `dist/`, uploads the Pages artifact, and deploys it. A failed test or build prevents deployment. The workflow uses the repository that triggered it and contains no hardcoded GitHub account.

In the repository on GitHub:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Ensure repository Actions policies allow the actions used by the workflow.
4. Push the project to the existing `origin/main`, or run **Build and deploy GitHub Pages** from the Actions tab.
5. After a successful deployment, open the URL shown in the deployment job or **Settings → Pages**.

These settings and the deployment permissions follow GitHub's [publishing source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) and [custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). The build job reads Pages metadata; the deploy job has `pages: write` and `id-token: write`. If the `github-pages` environment requires approval, an authorized reviewer must approve that deployment.

For the existing remote `https://github.com/fabtopos/bool.sym.io.git`, the standard project URL is **[https://fabtopos.github.io/bool.sym.io/](https://fabtopos.github.io/bool.sym.io/)** once Pages deployment succeeds. For a fork, use the corresponding owner's Pages URL. The workflow reports the actual deployed URL.

Vite uses `base: './'` so generated asset paths work at a project subdirectory and at a domain root. The name `bool.sym.io` does **not** configure that custom domain. To use it, separately configure GitHub Pages' custom domain and the domain's DNS records; no custom domain or `CNAME` file is assumed here.

## License

MIT. See the existing [LICENSE](LICENSE).
