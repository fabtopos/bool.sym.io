/** A small Boolean grammar. No expressions are evaluated as JavaScript. */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_EXPRESSION_LENGTH = 4096;
const MAX_NESTING = 256;

export function isVariableName(name) {
  // A JavaScript $ anchor can precede a final newline; check the entire match.
  return typeof name === 'string' && name.match(IDENTIFIER)?.[0] === name;
}

export class ExpressionError extends Error {
  constructor(message, position) {
    super(`${message} (column ${position + 1}).`);
    this.name = 'ExpressionError';
    this.position = position;
  }
}

function tokenize(source) {
  const tokens = [];
  let position = 0;
  while (position < source.length) {
    const character = source[position];
    if (/\s/.test(character)) {
      position += 1;
      continue;
    }
    const pair = source.slice(position, position + 2);
    if (pair === '&&' || pair === '||') {
      tokens.push({ type: pair, position });
      position += 2;
      continue;
    }
    if ('!^()'.includes(character)) {
      tokens.push({ type: character, position });
      position += 1;
      continue;
    }
    if (/[A-Za-z_]/.test(character)) {
      const start = position;
      while (position < source.length && /[A-Za-z0-9_]/.test(source[position])) position += 1;
      tokens.push({ type: 'name', value: source.slice(start, position), position: start });
      continue;
    }
    if (character === '0' || character === '1') {
      tokens.push({ type: 'literal', value: Number(character), position });
      position += 1;
      continue;
    }
    throw new ExpressionError(`Unexpected character "${character}". Use !, &&, ^, ||, parentheses, or 0 and 1`, position);
  }
  tokens.push({ type: 'end', position: source.length });
  return tokens;
}

/** Parse with precedence NOT > AND > XOR > OR; binary operators associate left. */
export function parseExpression(source, knownNames) {
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

  function unary() {
    nesting += 1;
    if (nesting > MAX_NESTING) throw new ExpressionError(`Expressions may be nested at most ${MAX_NESTING} levels`, peek().position);
    const token = consume();
    let result;
    if (token.type === '!') {
      result = { type: 'not', operand: unary() };
    } else if (token.type === '(') {
      result = or();
      if (peek().type !== ')') throw new ExpressionError('Expected a closing parenthesis', peek().position);
      consume();
    } else if (token.type === 'literal') {
      result = { type: 'literal', value: token.value };
    } else if (token.type === 'name') {
      if (!names.has(token.value)) throw new ExpressionError(`Unknown variable "${token.value}"`, token.position);
      dependencies.add(token.value);
      result = { type: 'variable', name: token.value };
    } else {
      throw new ExpressionError('Expected a variable, 0, 1, !, or an opening parenthesis', token.position);
    }
    nesting -= 1;
    return result;
  }

  function and() {
    let result = unary();
    while (peek().type === '&&') {
      consume();
      result = { type: 'and', left: result, right: unary() };
    }
    return result;
  }

  function xor() {
    let result = and();
    while (peek().type === '^') {
      consume();
      result = { type: 'xor', left: result, right: and() };
    }
    return result;
  }

  function or() {
    let result = xor();
    while (peek().type === '||') {
      consume();
      result = { type: 'or', left: result, right: xor() };
    }
    return result;
  }

  const ast = or();
  if (peek().type !== 'end') throw new ExpressionError('Expected a Boolean operator between expressions', peek().position);
  return { ast, dependencies: [...dependencies] };
}

/** Evaluate an AST against a record whose values are numeric bits. */
export function evaluateExpression(ast, stateRecord) {
  switch (ast.type) {
    case 'literal': return ast.value;
    case 'variable': {
      if (!Object.hasOwn(stateRecord, ast.name)) throw new Error(`Missing state value for variable "${ast.name}".`);
      const bit = stateRecord[ast.name];
      if (bit !== 0 && bit !== 1) throw new Error(`State value for "${ast.name}" must be 0 or 1.`);
      return bit;
    }
    case 'not': return 1 - evaluateExpression(ast.operand, stateRecord);
    case 'and': return evaluateExpression(ast.left, stateRecord) & evaluateExpression(ast.right, stateRecord);
    case 'xor': return evaluateExpression(ast.left, stateRecord) ^ evaluateExpression(ast.right, stateRecord);
    case 'or': return evaluateExpression(ast.left, stateRecord) | evaluateExpression(ast.right, stateRecord);
    default: throw new Error('Invalid Boolean expression syntax tree.');
  }
}
