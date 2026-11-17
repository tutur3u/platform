/**
 * Lexical early signal for migrations that add public relations or client
 * grants. The catalog check on a reset database is authoritative
 * (apps/database/scripts/verify-public-schema-catalog.mjs); this lint reports
 * problems before a database is available.
 */
const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QUALIFIED = String.raw`(${IDENT}(?:\s*\.\s*${IDENT})?)`;
const CLIENT_ROLE = /\b(anon|authenticated|public)\b/iu;

function unquote(identifier) {
  const trimmed = identifier.trim();
  return trimmed.startsWith('"') ? trimmed.slice(1, -1) : trimmed.toLowerCase();
}

/** Split `schema.name` into parts; unqualified names have schema null. */
function splitName(raw) {
  const parts = raw.split(/\s*\.\s*(?=(?:"|[A-Za-z_]))/u).map(unquote);
  return parts.length === 2
    ? { schema: parts[0], name: parts[1] }
    : { schema: null, name: parts[0] };
}

/** Remove comments; keep offsets stable by replacing with spaces. */
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//gu, (match) => match.replace(/[^\n]/gu, ' '))
    .replace(/--[^\n]*/gu, (match) => ' '.repeat(match.length));
}

/** Blank dollar-quoted bodies (functions, DO blocks), keeping offsets. */
function blankDollarBodies(sql) {
  return sql.replace(
    /(\$[A-Za-z_0-9]*\$)([\s\S]*?)\1/gu,
    (match, tag, body) => tag + body.replace(/[^\n]/gu, ' ') + tag
  );
}

function lineOf(sql, index) {
  return sql.slice(0, index).split('\n').length;
}

/**
 * The schema an unqualified name resolves to: the first entry of the last
 * `set search_path` before the statement, else public.
 */
function defaultSchemaAt(sql, index) {
  const pattern = /\bset\s+(?:local\s+)?search_path\s*(?:to|=)\s*([^;\n]+)/giu;
  let schema = 'public';
  for (const match of sql.matchAll(pattern)) {
    if (match.index > index) break;
    const first = match[1]
      .split(',')[0]
      .replace(/['"\s]/gu, '')
      .toLowerCase();
    if (first && first !== '$user') schema = first;
  }
  return schema;
}

function resolve(sql, raw, index) {
  const { schema, name } = splitName(raw);
  return { schema: schema ?? defaultSchemaAt(sql, index), name };
}

const CREATE_RULES = [
  {
    kind: 'CREATE TABLE',
    pattern: new RegExp(
      String.raw`\bcreate\s+(?:or\s+replace\s+)?(?:(?:global|local)\s+)?(temp|temporary|unlogged\s+)?\s*table\s+(?:if\s+not\s+exists\s+)?${QUALIFIED}`,
      'giu'
    ),
  },
  {
    kind: 'CREATE FOREIGN TABLE',
    pattern: new RegExp(
      String.raw`\bcreate\s+foreign\s+table\s+(?:if\s+not\s+exists\s+)?()${QUALIFIED}`,
      'giu'
    ),
  },
  {
    kind: 'CREATE VIEW',
    pattern: new RegExp(
      String.raw`\bcreate\s+(?:or\s+replace\s+)?(temp|temporary)?\s*(?:materialized\s+|recursive\s+)?view\s+(?:if\s+not\s+exists\s+)?${QUALIFIED}`,
      'giu'
    ),
  },
];

/**
 * Lint one migration file. `allowed` lists names permitted in public
 * (allowlisted relations and compat views). Returns findings with
 * severity error or warning.
 */
function lintMigration({
  file,
  sql,
  allowed,
  allowedFunctions,
  functionsEnforced,
}) {
  const text = stripComments(sql);
  const outer = blankDollarBodies(text);
  const findings = [];
  const add = (severity, index, kind, message) =>
    findings.push({ severity, file, line: lineOf(text, index), kind, message });

  for (const rule of CREATE_RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      if (/^temp/iu.test(match[1] ?? '')) continue;
      const target = resolve(text, match[2], match.index);
      if (target.schema === 'public' && !allowed.has(target.name))
        add(
          'error',
          match.index,
          rule.kind,
          `public.${target.name} is not allowlisted; create it in private`
        );
    }
  }

  const selectInto = new RegExp(
    String.raw`\bselect\b[^;]*?(?<!\b(?:insert|merge)\s+)\binto\s+(?!strict\b)(temp\s+|temporary\s+)?(?:unlogged\s+)?(?:table\s+)?${QUALIFIED}`,
    'giu'
  );
  for (const match of outer.matchAll(selectInto)) {
    if (match[1]) continue;
    const target = resolve(outer, match[2], match.index);
    if (target.schema === 'public' && !allowed.has(target.name))
      add(
        'error',
        match.index,
        'SELECT INTO',
        `public.${target.name} is not allowlisted; create it in private`
      );
  }

  const setSchema = new RegExp(
    String.raw`\balter\s+(?:table|view|materialized\s+view|foreign\s+table)\s+(?:if\s+exists\s+)?(?:only\s+)?${QUALIFIED}\s+set\s+schema\s+"?public"?\b`,
    'giu'
  );
  for (const match of text.matchAll(setSchema)) {
    const { name } = splitName(match[1]);
    if (!allowed.has(name))
      add(
        'error',
        match.index,
        'SET SCHEMA public',
        `${name} cannot move into public`
      );
  }

  const rename = new RegExp(
    String.raw`\balter\s+(?:table|view|materialized\s+view)\s+(?:if\s+exists\s+)?(?:only\s+)?${QUALIFIED}\s+rename\s+to\s+(${IDENT})`,
    'giu'
  );
  for (const match of text.matchAll(rename)) {
    const source = resolve(text, match[1], match.index);
    const name = unquote(match[2]);
    if (source.schema === 'public' && !allowed.has(name))
      add(
        'error',
        match.index,
        'RENAME',
        `public.${source.name} renamed to unallowlisted public.${name}`
      );
  }

  const grant =
    /\bgrant\s+[^;]*?\bon\s+(?!tables\b)(?!(?:all\s+)?(?:functions?|procedures?|routines?|sequences?|schema|database|type|domain|language|large\s+object|foreign)\b)(all\s+tables\s+in\s+schema\s+("?\w+"?)|(?:table\s+)?([^;]*?))\s+to\s+([^;']+)/giu;
  for (const match of text.matchAll(grant)) {
    if (!CLIENT_ROLE.test(match[4])) continue;
    if (match[2]) {
      if (unquote(match[2]) === 'public')
        add(
          'error',
          match.index,
          'GRANT',
          'client roles cannot be granted ALL TABLES IN SCHEMA public'
        );
      continue;
    }
    for (const raw of match[3].split(',')) {
      // Dynamic targets such as %I.%I are left to the catalog check.
      if (!new RegExp(`^\\s*${QUALIFIED}\\s*$`, 'u').test(raw)) continue;
      const target = resolve(text, raw.trim(), match.index);
      if (target.schema === 'public')
        add(
          'error',
          match.index,
          'GRANT',
          `client role grant on public.${target.name}; serve it through a server route`
        );
    }
  }

  const defaults =
    /\balter\s+default\s+privileges\b([^;]*?)\bgrant\s+[^;]*?\bon\s+(tables|sequences|functions|routines)\s+to\s+([^;']+)/giu;
  for (const match of text.matchAll(defaults)) {
    const scope = match[1].match(/\bin\s+schema\s+([^;]*?)(?:\s+grant\b|$)/iu);
    const schemas = scope ? scope[1].split(',').map(unquote) : ['public'];
    if (!schemas.includes('public')) continue;
    const roles = match[3].toLowerCase();
    const objects = match[2].toLowerCase();
    if (objects === 'tables' || objects === 'sequences') {
      if (CLIENT_ROLE.test(roles))
        add(
          'error',
          match.index,
          'DEFAULT PRIVILEGES',
          `client default grant on public ${objects}`
        );
    } else if (/\b(anon|public)\b/u.test(roles)) {
      add(
        'error',
        match.index,
        'DEFAULT PRIVILEGES',
        'anon/PUBLIC default EXECUTE in public'
      );
    } else if (/\bauthenticated\b/u.test(roles)) {
      add(
        'warning',
        match.index,
        'DEFAULT PRIVILEGES',
        'authenticated default EXECUTE in public'
      );
    }
  }

  const fn = new RegExp(
    String.raw`\bcreate\s+(?:or\s+replace\s+)?(?:function|procedure)\s+${QUALIFIED}\s*\(`,
    'giu'
  );
  for (const match of outer.matchAll(fn)) {
    const target = resolve(outer, match[1], match.index);
    if (target.schema !== 'public' || allowedFunctions.has(target.name))
      continue;
    add(
      functionsEnforced ? 'error' : 'warning',
      match.index,
      'CREATE FUNCTION',
      `public.${target.name} is a new public function; prefer private with service_role EXECUTE`
    );
  }
  return findings;
}

module.exports = { blankDollarBodies, lintMigration, splitName, stripComments };
