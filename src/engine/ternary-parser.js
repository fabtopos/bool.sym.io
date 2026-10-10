import { ExpressionError } from './parser.js';

const MAX_EXPRESSION_LENGTH = 4096;
const MAX_NESTING = 256;
const FUNCTIONS = new Map([['inc', 'increment'], ['dec', 'decrement']]);

function tokenize(source) {
  const tokens = [];
  let position = 0;
  while (position < source.length) {
    const character = source[position];
    if (/\s/.test(character)) {
      position += 1;
      continue;
    }
    if ('+-*()'.includes(character)) {
      tokens.push({ type: character, position });
      position += 1;
      continue;
    }
    if ('!&|^'.includes(character)) {
      throw new ExpressionError('Boolean operators are not supported in three-state arithmetic. Use +, - or *; results are reduced modulo 3', position);
    }
    if (/[A-Za-z_]/.test(character)) {
      const start = position;
      while (position < source.length && /[A-Za-z0-9_]/.test(source[position])) position += 1;
      tokens.push({ type: 'name', value: source.slice(start, position), position: start });
      continue;
    }
    if ('012'.includes(character)) {
      tokens.push({ type: 'literal', value: Number(character), position });
      position += 1;
      continue;
    }
    throw new ExpressionError(`Unexpected character "${character}". Use +, -, *, inc(...), dec(...), parentheses, or 0, 1 and 2`, position);
  }
  tokens.push({ type: 'end', position: source.length });
  return tokens;
}

/**
 * Safely parse arithmetic over the three-element field, never JavaScript.
 * Precedence is unary + / - > multiplication > addition / subtraction.
 * Binary operators associate left; all evaluated operations reduce modulo 3.
 * inc/dec accept one full expression and are functions only when followed by '('.
 */
export function parseTernaryExpression(source, knownNames) {
  if (typeof source !== 'string') throw new TypeError('An update expression must be a string.');
  if (source.length > MAX_EXPRESSION_LENGTH) throw new Error(`An update expression may contain at most ${MAX_EXPRESSION_LENGTH} characters.`);
  if (!source.trim()) throw new ExpressionError('Enter an update expression', 0);
  const names = new Set(knownNames);
  const tokens = tokenize(source);
  const dependencies = new Set();
  let cursor = 0;
  let nesting = 0;
  const peek = () => tokens[cursor];
  const consume = () => tokens[cursor++];

  function closingParenthesis() {
    if (peek().type !== ')') throw new ExpressionError('Expected a closing parenthesis', peek().position);
    consume();
  }

  function unary() {
    nesting += 1;
    if (nesting > MAX_NESTING) throw new ExpressionError(`Expressions may be nested at most ${MAX_NESTING} levels`, peek().position);
    const token = consume();
    let result;
    if (token.type === '+' || token.type === '-') {
      result = { type: token.type === '+' ? 'positive' : 'negative', operand: unary() };
    } else if (token.type === '(') {
      result = sum();
      closingParenthesis();
    } else if (token.type === 'literal') {
      result = { type: 'literal', value: token.value };
    } else if (token.type === 'name' && peek().type === '(') {
      if (!FUNCTIONS.has(token.value)) throw new ExpressionError(`Unknown function "${token.value}". Use inc(...) or dec(...)`, token.position);
      consume();
      result = { type: FUNCTIONS.get(token.value), operand: sum() };
      closingParenthesis();
    } else if (token.type === 'name') {
      if (!names.has(token.value)) throw new ExpressionError(`Unknown variable "${token.value}"`, token.position);
      dependencies.add(token.value);
      result = { type: 'variable', name: token.value };
    } else {
      throw new ExpressionError('Expected a variable, 0, 1, 2, unary + or -, inc(...), dec(...), or an opening parenthesis', token.position);
    }
    nesting -= 1;
    return result;
  }

  function product() {
    let result = unary();
    while (peek().type === '*') {
      consume();
      result = { type: 'multiply', left: result, right: unary() };
    }
    return result;
  }

  function sum() {
    let result = product();
    while (peek().type === '+' || peek().type === '-') {
      const operator = consume().type;
      result = { type: operator === '+' ? 'add' : 'subtract', left: result, right: product() };
    }
    return result;
  }

  const ast = sum();
  if (peek().type !== 'end') throw new ExpressionError('Expected an operator between expressions', peek().position);
  return { ast, dependencies: [...dependencies] };
}

// JavaScript's % is a remainder, so negative arithmetic needs a positive offset.
const moduloThree = (value) => ((value % 3) + 3) % 3;

/** Evaluate modulo 3 after each operation, keeping every result in {0, 1, 2}. */
export function evaluateTernaryExpression(ast, stateRecord) {
  switch (ast.type) {
    case 'literal': return ast.value;
    case 'variable': {
      if (!Object.hasOwn(stateRecord, ast.name)) throw new Error(`Missing state value for variable "${ast.name}".`);
      const value = stateRecord[ast.name];
      if (value !== 0 && value !== 1 && value !== 2) throw new Error(`State value for "${ast.name}" must be 0, 1 or 2.`);
      return value;
    }
    case 'positive': return evaluateTernaryExpression(ast.operand, stateRecord);
    case 'negative': return moduloThree(-evaluateTernaryExpression(ast.operand, stateRecord));
    case 'add': return moduloThree(evaluateTernaryExpression(ast.left, stateRecord) + evaluateTernaryExpression(ast.right, stateRecord));
    case 'subtract': return moduloThree(evaluateTernaryExpression(ast.left, stateRecord) - evaluateTernaryExpression(ast.right, stateRecord));
    case 'multiply': return moduloThree(evaluateTernaryExpression(ast.left, stateRecord) * evaluateTernaryExpression(ast.right, stateRecord));
    case 'increment': return moduloThree(evaluateTernaryExpression(ast.operand, stateRecord) + 1);
    case 'decrement': return moduloThree(evaluateTernaryExpression(ast.operand, stateRecord) - 1);
    default: throw new Error('Invalid three-state expression syntax tree.');
  }
}
