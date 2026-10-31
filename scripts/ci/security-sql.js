const crypto = require('node:crypto');

function tokens(sql) {
  const out = [];
  let i = 0;
  while (i < sql.length) {
    if (/\s/.test(sql[i])) {
      i++;
      continue;
    }
    if (sql.startsWith('--', i)) {
      i = sql.indexOf('\n', i);
      if (i < 0) break;
      continue;
    }
    if (sql.startsWith('/*', i)) {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith('/*', i)) {
          depth++;
          i += 2;
        } else if (sql.startsWith('*/', i)) {
          depth--;
          i += 2;
        } else i++;
      }
      if (depth) throw new Error('Unterminated SQL comment');
      continue;
    }
    const start = i;
    const dollar = sql.slice(i).match(/^\$(?:[a-z_][a-z_0-9]*)?\$/i)?.[0];
    if (dollar) {
      const end = sql.indexOf(dollar, i + dollar.length);
      if (end < 0) throw new Error('Unterminated SQL body');
      out.push({
        value: sql.slice(i + dollar.length, end),
        kind: 'body',
        start,
        end: end + dollar.length,
      });
      i = end + dollar.length;
      continue;
    }
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i++];
      let value = '';
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            value += quote;
            i += 2;
          } else {
            i++;
            closed = true;
            break;
          }
        } else value += sql[i++];
      }
      if (!closed) throw new Error('Unterminated SQL literal');
      out.push({
        value: quote === '"' ? value : value,
        kind: quote === '"' ? 'word' : 'string',
        quoted: quote === '"',
        start,
        end: i,
      });
      continue;
    }
    const value = sql
      .slice(i)
      .match(/^(?:[a-z_][a-z_0-9$]*|<>|!=|::|:=|[0-9]+|.)/i)[0];
    out.push({
      value: value.toLowerCase(),
      kind: 'word',
      start,
      end: i + value.length,
    });
    i += value.length;
  }
  return out;
}

function statements(sql) {
  const result = [];
  let current = [];
  for (const token of tokens(sql)) {
    if (token.kind === 'word' && !token.quoted && token.value === ';') {
      if (current.length) result.push(current);
      current = [];
    } else current.push(token);
  }
  if (current.length) result.push(current);
  return result;
}

function values(ts) {
  return ts.map((t) => t.value).join(' ');
}

function identity(ts, start, declaration = false) {
  let i = start;
  const names = [ts[i++]?.value];
  while (ts[i]?.value === '.') {
    names.push(ts[i + 1]?.value);
    i += 2;
  }
  if (!names[0] || ts[i]?.value !== '(')
    throw new Error('Unsupported function identity');
  let depth = 1;
  let brackets = 0;
  const args = [];
  let arg = [];
  while (++i < ts.length) {
    const v = ts[i].value;
    if (ts[i].kind === 'word' && !ts[i].quoted && v === '(') depth++;
    if (ts[i].kind === 'word' && !ts[i].quoted && v === ')') depth--;
    if (ts[i].kind === 'word' && !ts[i].quoted && v === '[') brackets++;
    if (ts[i].kind === 'word' && !ts[i].quoted && v === ']') brackets--;
    if (!depth) {
      if (arg.length) args.push(arg);
      break;
    }
    if (
      v === ',' &&
      ts[i].kind === 'word' &&
      !ts[i].quoted &&
      depth === 1 &&
      brackets === 0
    ) {
      args.push(arg);
      arg = [];
    } else arg.push(ts[i]);
  }
  if (depth) throw new Error('Unclosed function signature');
  const types = args
    .filter((a) => !declaration || a[0]?.quoted || a[0]?.value !== 'out')
    .map((a) => {
      let parts = a.map((t) => t.value);
      if (declaration) {
        const end = parts.findIndex((v) => v === 'default' || v === '=');
        if (end >= 0) parts = parts.slice(0, end);
        if (!a[0]?.quoted && ['in', 'inout', 'variadic'].includes(parts[0]))
          parts.shift();
        const builtins =
          /^(?:uuid|text|boolean|bool|int|int2|int4|int8|integer|bigint|smallint|json|jsonb|numeric|decimal|real|double|character|varchar|char|timestamp|timestamptz|time|timetz|date|interval|bytea|record|anyelement|anyarray|trigger|void)$/;
        if (
          parts.length > 1 &&
          !builtins.test(parts[0]) &&
          parts[1] !== '.' &&
          parts[1] !== '['
        )
          parts.shift();
      }
      return parts
        .join(' ')
        .replace(/\binteger\b/g, 'int4')
        .replace(/\bint\b/g, 'int4')
        .replace(/\bboolean\b/g, 'bool');
    });
  const name = names.length === 1 ? `public.${names[0]}` : names.join('.');
  return { name, signature: `${name}(${types.join(',')})`, end: i + 1 };
}

function definitions(sql) {
  return statements(sql).flatMap((ts) => {
    const prefix = values(ts.slice(0, 4));
    if (!/^create (?:or replace )?(?:function|procedure)\b/.test(prefix))
      return [];
    const start =
      ts.findIndex((t) => ['function', 'procedure'].includes(t.value)) + 1;
    const id = identity(ts, start, true);
    const options = ts.slice(id.end);
    if (
      !/\bsecurity definer\b/.test(
        values(options.filter((t) => t.kind === 'word'))
      )
    )
      return [];
    const body = options.find((t) => t.kind === 'body' || t.kind === 'string');
    if (!body) throw new Error(`Missing function body: ${id.signature}`);
    const digest = crypto
      .createHash('sha256')
      .update(JSON.stringify(ts.map(({ value, kind }) => [kind, value])))
      .digest('hex');
    return [
      { ...id, tokens: ts, body: body.value, digest, offset: ts[0].start },
    ];
  });
}

module.exports = { tokens, statements, values, identity, definitions };
