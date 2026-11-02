const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT_DIR = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'apps/database/supabase/migrations');
const HELPER = 'public.has_workspace_permission';

function normalizeName(raw) {
  const name = raw.replace(/"/gu, '').toLowerCase();
  return name.includes('.') ? name : `public.${name}`;
}

// Latest definition of every function across migrations, in filename order,
// so a later CREATE OR REPLACE always wins. Later DROP FUNCTION removes it.
function readLatestDefinitions() {
  const definitions = new Map();
  const header =
    /create\s+(?:or\s+replace\s+)?function\s+((?:"?\w+"?\.)?"?\w+"?)\s*\(/giu;
  const drop =
    /drop\s+function\s+(?:if\s+exists\s+)?((?:"?\w+"?\.)?"?\w+"?)\s*\(/giu;

  for (const filename of fs.readdirSync(MIGRATIONS_DIR).sort()) {
    if (!filename.endsWith('.sql')) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
    const events = [];

    for (const match of sql.matchAll(header)) {
      const rest = sql.slice(match.index);
      const quote = rest.match(/\bas\s+(\$\w*\$)/iu);
      assert.ok(quote, `${filename}: ${match[1]} has no dollar-quoted body`);
      const start = quote.index + quote[0].length;
      const end = rest.indexOf(quote[1], start);
      assert.ok(end > start, `${filename}: ${match[1]} body is not terminated`);
      events.push({
        index: match.index,
        name: normalizeName(match[1]),
        definition: {
          filename,
          sql,
          body: rest.slice(start, end),
          trigger: /\breturns\s+trigger\b/iu.test(rest.slice(0, quote.index)),
        },
      });
    }
    for (const match of sql.matchAll(drop)) {
      events.push({ index: match.index, name: normalizeName(match[1]) });
    }

    for (const event of events.sort((a, b) => a.index - b.index)) {
      if (event.definition) definitions.set(event.name, event.definition);
      else definitions.delete(event.name);
    }
  }

  return definitions;
}

const definitions = readLatestDefinitions();

function latest(name) {
  const definition = definitions.get(name);
  assert.ok(definition, `no live migration defines ${name}`);
  return definition;
}

const END_USER_ROLES = /in\s*\(\s*'anon'\s*,\s*'authenticated'\s*\)/iu;

test('latest has_workspace_permission binds end-user callers outside triggers', () => {
  const { filename, body } = latest(HELPER);
  const binding = body.match(
    /if\s+pg_trigger_depth\(\)\s*=\s*0\s+and\s+([\s\S]*?)\bthen\s+return\s+false\s*;/iu
  );

  assert.ok(
    binding,
    `${filename}: has_workspace_permission must start with a pg_trigger_depth() = 0 caller binding that returns false`
  );
  assert.match(
    binding[1],
    END_USER_ROLES,
    `${filename}: the binding must apply to the anon and authenticated JWT roles`
  );
  assert.match(
    binding[1],
    /request\.jwt\.claims?/iu,
    `${filename}: the binding must read the role from the request JWT`
  );
  assert.match(
    binding[1],
    /p_user_id\s+is\s+distinct\s+from\s+auth\.uid\(\)/iu,
    `${filename}: the binding must compare p_user_id with auth.uid()`
  );
  assert.ok(
    binding.index < body.search(/\bselect\b/iu),
    `${filename}: the binding must run before any permission lookup`
  );
});

test('latest time-tracking update guard ignores the actor override for end users', () => {
  const { filename, body } = latest(
    'private.check_time_tracking_request_update'
  );

  assert.match(
    body,
    new RegExp(
      `v_actor_id\\s+uuid\\s*:=\\s*case[\\s\\S]*?${END_USER_ROLES.source}\\s*then\\s+auth\\.uid\\(\\)`,
      'iu'
    ),
    `${filename}: under anon or authenticated the actor must be auth.uid()`
  );
});

// Trigger calls are exempt from the caller binding, so every trigger that
// evaluates permissions must be reviewed and listed in the inventory carried
// by the migration that last defines the helper.
test('trigger callers of has_workspace_permission match the reviewed inventory', () => {
  const { filename, sql } = latest(HELPER);
  const block = sql.match(/^-- Trigger inventory\b[^\n]*\n((?:--[^\n]*\n)+)/mu);
  assert.ok(
    block,
    `${filename}: missing the "-- Trigger inventory" header block`
  );

  const inventory = [
    ...block[1].matchAll(/^--\s{2,}((?:public|private)\.\w+)\(\)/gmu),
  ]
    .map((match) => match[1].toLowerCase())
    .sort();
  assert.ok(
    inventory.length > 0,
    `${filename}: the trigger inventory is empty`
  );

  const callers = [...definitions]
    .filter(
      ([name, definition]) =>
        name !== HELPER &&
        definition.trigger &&
        /\b(?:has_workspace_permission|is_org_member)\s*\(/iu.test(
          definition.body
        )
    )
    .map(([name]) => name)
    .sort();

  assert.deepEqual(
    callers,
    inventory,
    `${filename}: review every trigger that calls has_workspace_permission and update the trigger inventory`
  );
});

// Triggers allowed to evaluate a user other than the caller. Their result must
// not be observable by the writer (notification recipient selection only).
const OTHER_USER_TRIGGER_ALLOWLIST = [
  'private.notify_time_tracking_request_status_change',
  'private.notify_time_tracking_request_submitted',
];

// Argument lists of every has_workspace_permission( call, split on top-level
// commas so nested calls such as auth.uid() stay intact.
function helperCallArguments(body) {
  const calls = [];
  const opener = /\b(has_workspace_permission|is_org_member)\s*\(/giu;
  for (const match of body.matchAll(opener)) {
    const args = [];
    let depth = 0;
    let current = '';
    for (const char of body.slice(match.index + match[0].length)) {
      if (char === '(') depth++;
      if (char === ')' && depth-- === 0) break;
      if (char === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
      } else current += char;
    }
    args.push(current.trim());
    calls.push(
      match[1].toLowerCase() === 'is_org_member' ? [args[1], args[0]] : args
    );
  }
  return calls;
}

const CALLER_EXPRESSION = new RegExp(
  `^(?:\\(\\s*select\\s+)?auth\\.uid\\(\\)\\s*\\)?$|^case\\b[\\s\\S]*?${END_USER_ROLES.source}\\s*then\\s+auth\\.uid\\(\\)`,
  'iu'
);

// True when the user argument is auth.uid() or a variable bound to it.
function isCallerBound(argument, body) {
  if (CALLER_EXPRESSION.test(argument)) return true;
  if (!/^\w+$/u.test(argument)) return false;
  const assignments = [
    ...body.matchAll(
      new RegExp(`\\b${argument}\\b(?:\\s+uuid)?\\s*:=\\s*([^;]+);`, 'giu')
    ),
  ].map((match) => match[1].trim());
  return (
    assignments.length > 0 &&
    assignments.every((value) => CALLER_EXPRESSION.test(value))
  );
}

test('trigger calls about other users are explicitly allowlisted', () => {
  const offenders = [...definitions]
    .filter(([name, definition]) => name !== HELPER && definition.trigger)
    .flatMap(([name, definition]) =>
      helperCallArguments(definition.body)
        .filter((args) => !isCallerBound(args[1] ?? '', definition.body))
        .map(() => name)
    );

  assert.deepEqual(
    [...new Set(offenders)].sort(),
    OTHER_USER_TRIGGER_ALLOWLIST,
    'a trigger evaluates a user other than auth.uid(); bind it to the caller or review and allowlist it'
  );
});

test('latest is_org_member binds end-user callers outside triggers', () => {
  const { body } = latest('public.is_org_member');
  assert.match(body, /pg_trigger_depth\(\)\s*=\s*0/iu);
  assert.match(body, END_USER_ROLES);
  assert.match(body, /_user_id\s+is\s+distinct\s+from\s+v_caller_id/iu);
  assert.match(body, /v_caller_id\s+uuid\s*:=\s*auth\.uid\(\)/iu);
});

test('unreviewed cross-user trigger caller fails the guard', () => {
  const { spawnSync } = require('node:child_process');
  const fixture = path.join(
    MIGRATIONS_DIR,
    '99999999999999_scope_guard_negative.sql'
  );
  assert.equal(fs.existsSync(fixture), false);
  try {
    fs.writeFileSync(
      fixture,
      `CREATE FUNCTION public.unreviewed_scope_probe() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM public.is_org_member(NEW.user_id, NEW.ws_id); RETURN NEW; END; $$;`
    );
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(
      process.execPath,
      [
        '--test',
        '--test-name-pattern=trigger callers|trigger calls about',
        __filename,
      ],
      { encoding: 'utf8', env }
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /unreviewed_scope_probe/);
  } finally {
    fs.unlinkSync(fixture);
  }
});
