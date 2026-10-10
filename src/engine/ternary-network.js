import { isVariableName } from './parser.js';
import { evaluateTernaryExpression, parseTernaryExpression } from './ternary-parser.js';

// 3^5 = 243 states fits the same complete-graph budget as the Boolean module.
export const MAX_TERNARY_VARIABLES = 5;

/** Ordered variables define the left-to-right digit order in each ternary state. */
export class TernaryNetwork {
  constructor(definitions) {
    if (!Array.isArray(definitions) || definitions.length < 1 || definitions.length > MAX_TERNARY_VARIABLES) {
      throw new Error(`A three-state network must contain between 1 and ${MAX_TERNARY_VARIABLES} variables (at most 243 phase-space states).`);
    }
    const names = definitions.map((definition, index) => {
      if (!definition || !isVariableName(definition.name)) {
        throw new Error(`Variable ${index + 1} needs a name starting with a letter or underscore, followed by letters, digits, or underscores.`);
      }
      return definition.name;
    });
    if (new Set(names).size !== names.length) throw new Error('Variable names must be unique.');
    this.radix = 3;
    this.maxVariables = MAX_TERNARY_VARIABLES;
    this.names = Object.freeze(names);
    this.size = names.length;
    this.variables = Object.freeze(definitions.map(({ name, expression }) => {
      try {
        const { ast, dependencies } = parseTernaryExpression(expression, names);
        return Object.freeze({ name, expression, ast, dependencies: Object.freeze(dependencies) });
      } catch (error) {
        throw new Error(`Update rule for ${name}: ${error.message}`);
      }
    }));
  }

  validateState(stateString) {
    if (typeof stateString !== 'string' || stateString.length !== this.size || /[^012]/.test(stateString)) {
      throw new Error(`Enter exactly ${this.size} ternary digits (0, 1 or 2), in the order ${this.names.join(', ')}.`);
    }
    return stateString;
  }

  nextState(stateString) {
    this.validateState(stateString);
    const previous = Object.create(null);
    this.names.forEach((name, index) => { previous[name] = Number(stateString[index]); });
    // Every expression reads the same immutable previous configuration.
    return this.variables.map(({ ast }) => evaluateTernaryExpression(ast, previous)).join('');
  }
}
