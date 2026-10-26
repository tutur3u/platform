// Minimal evaluator for GitHub Actions `${{ }}` expressions with GitHub's
// semantics rather than JavaScript's: `==`/`!=` compare strings ignoring case,
// mismatched types coerce to numbers (null -> 0, '' -> 0, 'x' -> NaN), and
// dereferencing null or a missing property yields null instead of throwing.
// Tests use it so a guard such as `head_branch == 'main'` is judged the way
// the runner judges it, including admitting a branch named `Main`.

const OPERATORS = ['&&', '||', '==', '!=', '<=', '>=', '<', '>', '!'];

function tokenize(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const space = /^\s+/u.exec(rest);
    if (space) {
      index += space[0].length;
      continue;
    }
    const string = /^'((?:[^']|'')*)'/u.exec(rest);
    if (string) {
      tokens.push({ type: 'value', value: string[1].replaceAll("''", "'") });
      index += string[0].length;
      continue;
    }
    const number = /^(?:0x[0-9a-f]+|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/iu.exec(
      rest
    );
    if (number) {
      tokens.push({ type: 'value', value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    const word = /^[A-Za-z_][\w-]*/u.exec(rest);
    if (word) {
      const literals = { false: false, null: null, true: true };
      tokens.push(
        word[0] in literals
          ? { type: 'value', value: literals[word[0]] }
          : { type: 'name', value: word[0] }
      );
      index += word[0].length;
      continue;
    }
    const operator = OPERATORS.find((item) => rest.startsWith(item));
    if (operator) {
      tokens.push({ type: 'op', value: operator });
      index += operator.length;
      continue;
    }
    if ('()[].,*'.includes(rest[0])) {
      tokens.push({ type: 'op', value: rest[0] });
      index += 1;
      continue;
    }
    throw new SyntaxError(`Unsupported expression near: ${rest.slice(0, 20)}`);
  }
  return tokens;
}

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    return value.trim() === '' ? 0 : Number(value);
  }
  return Number.NaN;
}

function normalize(value) {
  return value === undefined ? null : value;
}

function equals(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  if (typeof a === 'string' && typeof b === 'string') {
    return a.toLowerCase() === b.toLowerCase();
  }
  if (typeof a === typeof b && (a === null || typeof a !== 'object')) {
    return a === b;
  }
  if (a !== null && b !== null && typeof a === 'object') return a === b;
  return toNumber(a) === toNumber(b);
}

function compare(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  if (typeof a === 'string' && typeof b === 'string') {
    return a.toLowerCase().localeCompare(b.toLowerCase());
  }
  return toNumber(a) - toNumber(b);
}

function truthy(value) {
  const item = normalize(value);
  return !(
    item === null ||
    item === false ||
    item === '' ||
    item === 0 ||
    Number.isNaN(item)
  );
}

const FILTERED = Symbol('object filter');

function filtered(value) {
  const item = normalize(value);
  const items = Array.isArray(item)
    ? item
    : item && typeof item === 'object'
      ? Object.values(item)
      : [];
  return Object.assign([...items], { [FILTERED]: true });
}

function property(target, key) {
  const item = normalize(target);
  if (item === null || typeof item !== 'object') return null;
  const value = item[key];
  if (value !== undefined) return value;
  // Context and object keys are case-insensitive as well.
  const match = Object.keys(item).find(
    (name) => name.toLowerCase() === String(key).toLowerCase()
  );
  return match === undefined ? null : normalize(item[match]);
}

function text(value) {
  const item = normalize(value);
  if (item === null) return '';
  if (typeof item === 'object') return JSON.stringify(item);
  return String(item);
}

const lower = (value) => text(value).toLowerCase();

const FUNCTIONS = {
  always: () => true,
  cancelled: () => false,
  contains: (haystack, needle) =>
    Array.isArray(haystack)
      ? haystack.some((item) => equals(item, needle))
      : lower(haystack).includes(lower(needle)),
  endsWith: (value, suffix) => lower(value).endsWith(lower(suffix)),
  failure: () => false,
  format: (template, ...args) =>
    text(template).replace(/\{(\d+)\}/gu, (_, i) => text(args[Number(i)])),
  fromJSON: (value) => JSON.parse(text(value)),
  join: (items, separator = ',') =>
    Array.isArray(items) ? items.map(text).join(text(separator)) : text(items),
  startsWith: (value, prefix) => lower(value).startsWith(lower(prefix)),
  success: () => true,
  toJSON: (value) => JSON.stringify(normalize(value)),
};

function parse(tokens, scope) {
  let position = 0;
  const peek = () => tokens[position];
  const take = (value) => {
    const token = tokens[position];
    if (value !== undefined && token?.value !== value) {
      throw new SyntaxError(`Expected ${value}`);
    }
    position += 1;
    return token;
  };
  const isOp = (value) => peek()?.type === 'op' && peek().value === value;

  function primary() {
    const token = take();
    if (!token) throw new SyntaxError('Unexpected end of expression');
    if (token.type === 'value') return token.value;
    if (token.type === 'op' && token.value === '(') {
      const value = or();
      take(')');
      return value;
    }
    if (token.type === 'op' && token.value === '!') return !truthy(unary());
    if (token.type !== 'name') throw new SyntaxError('Unexpected token');
    if (isOp('(')) {
      take('(');
      const args = [];
      while (!isOp(')')) {
        args.push(or());
        if (isOp(',')) take(',');
      }
      take(')');
      const fn = Object.entries(FUNCTIONS).find(
        ([name]) => name.toLowerCase() === token.value.toLowerCase()
      );
      if (!fn) throw new SyntaxError(`Unknown function ${token.value}`);
      return fn[1](...args);
    }
    return property(scope, token.value);
  }

  function unary() {
    if (isOp('!')) {
      take('!');
      return !truthy(unary());
    }
    let value = primary();
    for (;;) {
      if (isOp('.')) {
        take('.');
        if (isOp('*')) {
          // Object filter (`labels.*.name`): later keys map over each item.
          take('*');
          value = filtered(value);
        } else {
          const key = take().value;
          value = value?.[FILTERED]
            ? filtered(
                value
                  .map((item) => property(item, key))
                  .filter((item) => item !== null)
              )
            : property(value, key);
        }
      } else if (isOp('[')) {
        take('[');
        const key = or();
        take(']');
        value = property(value, key);
      } else {
        return value;
      }
    }
  }

  function comparison() {
    let value = unary();
    for (;;) {
      const op = peek()?.type === 'op' ? peek().value : undefined;
      if (op === '==' || op === '!=') {
        take();
        const result = equals(value, unary());
        value = op === '==' ? result : !result;
      } else if (['<', '<=', '>', '>='].includes(op)) {
        take();
        const diff = compare(value, unary());
        value =
          op === '<'
            ? diff < 0
            : op === '<='
              ? diff <= 0
              : op === '>'
                ? diff > 0
                : diff >= 0;
      } else {
        return value;
      }
    }
  }

  function and() {
    let value = comparison();
    while (isOp('&&')) {
      take();
      const right = comparison();
      value = truthy(value) ? right : value;
    }
    return value;
  }

  function or() {
    let value = and();
    while (isOp('||')) {
      take();
      const right = and();
      value = truthy(value) ? value : right;
    }
    return value;
  }

  const value = or();
  if (position !== tokens.length) throw new SyntaxError('Trailing tokens');
  return normalize(value);
}

function stripDelimiters(expression) {
  return String(expression)
    .trim()
    .replace(/^\$\{\{([\s\S]*)\}\}$/u, '$1');
}

// Evaluates one expression (with or without `${{ }}`) against a context scope
// such as { github, needs, steps, inputs, vars }.
function evaluateExpression(expression, scope) {
  return parse(tokenize(stripDelimiters(expression)), scope);
}

// Renders a string that may embed several `${{ }}` expressions, as GitHub
// does for `env`, `with` and `run` values.
function renderTemplate(template, scope) {
  if (typeof template !== 'string') return template;
  return template.replace(/\$\{\{([\s\S]*?)\}\}/gu, (_, code) =>
    text(evaluateExpression(code, scope))
  );
}

module.exports = { evaluateExpression, renderTemplate, text, truthy };
