function lexSql(sql) {
  let code = '';
  let line = 1;
  let index = 0;
  const comments = [];
  const bodies = [];
  const bodyLines = [];
  const bodyStarts = [];
  const configurations = [];
  const emit = (end, keep) => {
    const chunk = sql.slice(index, end);
    code += keep ? chunk : chunk.replace(/[^\n]/g, ' ');
    for (const char of chunk) if (char === '\n') line++;
    index = end;
  };

  while (index < sql.length) {
    const char = sql[index];
    if (sql.startsWith('--', index)) {
      const newline = sql.indexOf('\n', index);
      const end = newline < 0 ? sql.length : newline;
      comments.push({ line, start: index, text: sql.slice(index + 2, end) });
      emit(end, false);
    } else if (sql.startsWith('/*', index)) {
      let depth = 0;
      let cursor = index;
      while (cursor < sql.length) {
        if (sql.startsWith('/*', cursor)) {
          depth++;
          cursor += 2;
        } else if (sql.startsWith('*/', cursor)) {
          depth--;
          cursor += 2;
          if (depth === 0) break;
        } else cursor++;
      }
      emit(cursor, false);
    } else if (char === "'") {
      const escapes =
        /[eE]/.test(sql[index - 1] ?? '') &&
        !/[\w$]/.test(sql[index - 2] ?? '');
      let cursor = index + 1;
      while (cursor < sql.length) {
        if (escapes && sql[cursor] === '\\') cursor += 2;
        else if (sql[cursor] !== "'") cursor++;
        else if (sql[cursor + 1] === "'") cursor += 2;
        else {
          cursor++;
          break;
        }
      }
      const prefix = code.slice(code.lastIndexOf(';') + 1);
      const pathLiteral =
        /\bset\s+(?:"search_path"|search_path)\s*(?:=|to)\s*(?:[a-z_][a-z0-9_]*\s*,\s*)*$/i.test(
          prefix
        );
      const literal = sql.slice(index + 1, cursor - 1);
      if (
        /\bset_config\s*\(\s*$/i.test(prefix) &&
        ['search_path', 'standard_conforming_strings'].includes(
          literal.toLowerCase()
        )
      )
        configurations.push({ name: literal.toLowerCase(), line });
      if (pathLiteral && /^[a-z_][a-z0-9_]*$/i.test(literal)) {
        code += literal.padEnd(cursor - index, ' ');
        index = cursor;
      } else emit(Math.min(cursor, sql.length), false);
    } else if (char === '"' || /^[uU]&"/.test(sql.slice(index, index + 3))) {
      const unicode = char !== '"';
      let cursor = index + (unicode ? 3 : 1);
      while (cursor < sql.length) {
        if (sql[cursor] !== '"') cursor++;
        else if (sql[cursor + 1] === '"') cursor += 2;
        else {
          cursor++;
          break;
        }
      }
      if (unicode) {
        // PostgreSQL permits comments and no whitespace between these tokens.
        const trivia = String.raw`(?:\s|--[^\n]*(?:\n|$)|/\*(?:[^*]|\*(?!/))*\*/)*`;
        const clause = new RegExp(`^${trivia}uescape${trivia}'(.)'`, 'i').exec(
          sql.slice(cursor)
        );
        if (clause) {
          const identifier = sql.slice(index, cursor);
          const escapeChar = clause[1];
          code +=
            identifier.slice(0, 3) +
            identifier.slice(3, -1).split(escapeChar).join('\\') +
            '"';
          index = cursor;
          emit(cursor + clause[0].length, false);
          continue;
        }
      }
      emit(Math.min(cursor, sql.length), true);
    } else {
      const tag =
        char === '$' && !/[a-z0-9_$\u0080-\uffff]/i.test(sql[index - 1] ?? '')
          ? /^\$(?:[A-Za-z_\u0080-\uffff][A-Za-z0-9_\u0080-\uffff]*)?\$/.exec(
              sql.slice(index)
            )
          : null;
      if (tag) {
        const close = sql.indexOf(tag[0], index + tag[0].length);
        bodyLines.push(line);
        bodyStarts.push(index);
        bodies.push(
          sql.slice(index + tag[0].length, close < 0 ? sql.length : close)
        );
        emit(close < 0 ? sql.length : close + tag[0].length, false);
      } else {
        code += char;
        if (char === '\n') line++;
        index++;
      }
    }
  }
  return { code, comments, bodies, bodyLines, bodyStarts, configurations };
}

function splitStatements(code) {
  const parts = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '"') {
      if (quoted && code[i + 1] === '"') {
        i++;
        continue;
      }
      quoted = !quoted;
    }
    if (code[i] === ';' && !quoted) {
      parts.push(code.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(code.slice(start));
  return parts;
}
function foldSql(code) {
  return (code.match(/"(?:[^"]|"")*"|[^"\s]+|\s+/g) ?? [])
    .map((token, index, tokens) =>
      token.startsWith('"')
        ? (/[a-z0-9_]$/i.test(tokens[index - 1] ?? '') ? ' ' : '') + token
        : token.replace(/\s+/g, ' ').toLowerCase()
    )
    .join('')
    .trim();
}
function countNewlines(text) {
  return text.split('\n').length - 1;
}

// Splits lexed SQL into normalized (lowercase, single-spaced) statements.
function parseStatements(sql) {
  const { code, comments } = lexSql(sql);
  const statements = [];
  let line = 1;
  let offset = 0;
  for (const part of splitStatements(code)) {
    const startLine = line + countNewlines(/^\s*/.exec(part)[0]);
    const body = part.trim();
    if (body) {
      statements.push({
        text: foldSql(
          body.replace(
            /u&"((?:[^"]|"")*)"(?:\s+uescape\s+'(.)')?/gi,
            (_, value, escapeChar = '\\') => {
              const escaped = escapeChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const pattern = new RegExp(
                `${escaped}(?:${escaped}|\\+([0-9a-f]{6})|([0-9a-f]{4}))`,
                'gi'
              );
              return (
                '"' +
                value.replace(pattern, (match, six, four) => {
                  if (!six && !four) return escapeChar;
                  const point = parseInt(six || four, 16);
                  return point <= 0x10ffff
                    ? String.fromCodePoint(point)
                    : match;
                }) +
                '"'
              );
            }
          )
        ),
        start: offset + part.indexOf(body),
        end: offset + part.length,
        startLine,
        endLine: line + countNewlines(part),
      });
    }
    line += countNewlines(part);
    offset += part.length + 1;
  }
  for (const comment of comments) {
    comment.statement = statements.find(
      (statement) =>
        comment.start >= statement.start && comment.start <= statement.end
    );
    if (comment.statement) continue;
    const previous = statements
      .filter((statement) => statement.end < comment.start)
      .at(-1);
    comment.statement =
      previous?.endLine === comment.line
        ? previous
        : statements.find(
            (statement) =>
              statement.start > comment.start &&
              statement.startLine === comment.line + 1
          );
  }
  return { statements, comments };
}

module.exports = { lexSql, parseStatements, splitStatements };
