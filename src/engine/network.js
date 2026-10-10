import { evaluateExpression, isVariableName, parseExpression } from './parser.js';

export const MAX_VARIABLES = 8;

/** Ordered variables define the left-to-right bit order in every binary state. */
export class BooleanNetwork {
  constructor(definitions) {
    if (!Array.isArray(definitions) || definitions.length < 1 || definitions.length > MAX_VARIABLES) {
      throw new Error(`A network must contain between 1 and ${MAX_VARIABLES} variables.`);
    }
    const names = definitions.map((definition, index) => {
      if (!definition || !isVariableName(definition.name)) {
        throw new Error(`Variable ${index + 1} needs a name starting with a letter or underscore, followed by letters, digits, or underscores.`);
      }
      return definition.name;
    });
    if (new Set(names).size !== names.length) throw new Error('Variable names must be unique.');
    this.radix = 2;
    this.maxVariables = MAX_VARIABLES;
    this.names = Object.freeze(names);
    this.size = names.length;
    this.variables = Object.freeze(definitions.map(({ name, expression }) => {
      try {
        const { ast, dependencies } = parseExpression(expression, names);
        return Object.freeze({ name, expression, ast, dependencies: Object.freeze(dependencies) });
      } catch (error) {
        throw new Error(`Update rule for ${name}: ${error.message}`);
      }
    }));
  }

  validateState(binaryString) {
    if (typeof binaryString !== 'string' || binaryString.length !== this.size || /[^01]/.test(binaryString)) {
      throw new Error(`Enter exactly ${this.size} binary digits (0 or 1), in the order ${this.names.join(', ')}.`);
    }
    return binaryString;
  }

  nextState(binaryString) {
    this.validateState(binaryString);
    const previous = Object.create(null);
    this.names.forEach((name, index) => { previous[name] = Number(binaryString[index]); });
    // Every expression sees this one unchanged record, ensuring synchronous updates.
    return this.variables.map(({ ast }) => evaluateExpression(ast, previous)).join('');
  }
}
