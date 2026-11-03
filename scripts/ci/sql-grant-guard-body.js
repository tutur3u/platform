const { lexSql, parseStatements } = require('./sql-grant-guard-lexer');

function nestedBodyGrants(sql) {
  const findings = [];
  const { statements } = parseStatements(sql);
  const outer = lexSql(sql);
  const pending = outer.bodies.flatMap((text, index) => {
    const line = outer.bodyLines[index];
    const owner = statements.find(
      (s) =>
        s.start <= outer.bodyStarts[index] && s.end >= outer.bodyStarts[index]
    );
    return owner &&
      /^(?:do|create (?:or replace )?(?:function|procedure))\b/.test(owner.text)
      ? [{ text, line }]
      : [];
  });
  const refuse = (line) =>
    findings.push({
      rule: 'function-acl',
      line,
      detail: 'quoted routine body is unsupported; use a dollar-quoted body',
    });
  for (const literal of outer.literalBodies) refuse(literal.line);
  for (const body of pending) {
    const lexed = lexSql(body.text);
    for (const literal of lexed.literalBodies)
      refuse(body.line + literal.line - 1);
    for (const [index, text] of lexed.bodies.entries()) {
      pending.push({ text, line: body.line + lexed.bodyLines[index] - 1 });
    }
    for (const statement of parseStatements(body.text).statements) {
      if (/\buescape\b/.test(statement.text))
        findings.push({
          rule: 'function-acl',
          line: body.line + statement.startLine - 1,
          detail: 'unparsed UESCAPE requires scanner support',
        });
      const grant = /(?:^|\s)grant\s+.+?\s+to\s+(.*)$/.exec(statement.text);
      if (!grant) continue;
      const roles = grant[1].split(',').map((role) =>
        role
          .trim()
          .replace(/\s+(?:with|granted)\s+.*$/, '')
          .replace(/^group\s+/, '')
          .replace(/^"([^"\n]*)"$/, '$1')
      );
      const open = roles.filter((role) => ['anon', 'public'].includes(role));
      if (open.length)
        findings.push({
          rule: 'anon-grant',
          line: body.line + statement.startLine - 1,
          detail: 'literal body grant to ' + open.join(', '),
        });
    }
  }
  return findings;
}
module.exports = { nestedBodyGrants };
