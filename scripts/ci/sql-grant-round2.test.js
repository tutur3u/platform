// Regressions for the round-2 security review of PR #7234: the same-file cutoff
// must not hide later grants, and signature-free DROP/ALTER/GRANT target every
// overload of a name.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { routineAclEffect } = require('./sql-grant-acl');
const {
  FROZEN_DEFINERS,
  FROZEN_DEFINERS_CUTOFF,
} = require('./sql-grant-frozen-definers');
const {
  readRoutine,
  routineKey,
  signatureTypes,
} = require('./sql-grant-identifiers');
const { RULES, evaluateSqlFiles } = require('./sql-grant-guard');

const ROOT = path.resolve(__dirname, '..', '..');
const MIGRATIONS = 'apps/database/supabase/migrations/';
const LATE = `${MIGRATIONS}20261030000000_late.sql`;
const NEXT = `${MIGRATIONS}20261030000100_next.sql`;
const FIXTURE = `${MIGRATIONS}20261030000200_other.sql`;
const EARLY = `${MIGRATIONS}20261016104000_early.sql`;
const FROZEN_FILE =
  '20261029030400_align_ai_chat_and_subscription_rpc_access.sql';
const FROZEN = `${MIGRATIONS}${FROZEN_FILE}`;
const NAME = 'public.get_user_workspace_subscription_info';
const SIGNATURE = `${NAME}(uuid)`;

const create = (name, body = 'create or replace function') =>
  `${body} ${name}(p uuid) returns void language sql security definer as $$ select $$;`;
const revoke = (signature, roles = 'public, anon, authenticated') =>
  `revoke all on function ${signature} from ${roles};`;

function run(fixtures) {
  return evaluateSqlFiles({
    files: Object.keys(fixtures).sort(),
    readFile: (file) => fixtures[file],
  });
}
function definerFailures(result) {
  return result.violations.filter((item) => item.rule === RULES.definerPublic);
}
// Frozen definer closed in EARLY, optionally disturbed by `middle`, then
// replaced in its frozen file without a revoke of its own.
function frozen(middle = '') {
  return {
    [EARLY]: `${create(NAME, 'create function')}\n${revoke(SIGNATURE)}\n${middle}`,
    [FROZEN]: create(NAME),
  };
}

test('the shared frozen module is deeply frozen and self-consistent', () => {
  assert.equal(FROZEN_DEFINERS.length, 6);
  assert.equal(FROZEN_DEFINERS_CUTOFF, '20261029030400');
  assert.ok(Object.isFrozen(FROZEN_DEFINERS));
  for (const entry of FROZEN_DEFINERS) {
    assert.ok(Object.isFrozen(entry));
    assert.ok(Object.isFrozen(entry.requiredRevoked));
    const routine = readRoutine(entry.signature);
    assert.equal(
      entry.key,
      routineKey(routine.name, signatureTypes(routine.args)),
      entry.signature
    );
    assert.equal(entry.version, /^\d{14}/.exec(entry.file)[0]);
  }
});

test('the frozen list lives in one module only', () => {
  const owners = fs
    .readdirSync(__dirname)
    .filter((name) => name.endsWith('.js') && !name.endsWith('.test.js'))
    .filter((name) =>
      fs
        .readFileSync(path.join(__dirname, name), 'utf8')
        .includes('align_ai_chat_and_subscription_rpc_access')
    );
  assert.deepEqual(owners, ['sql-grant-frozen-definers.js']);
});

test('a post-cutoff creation followed by a later-file grant to PUBLIC or anon fails', () => {
  const created = `${create('public.f')}\n${revoke('public.f(uuid)', 'public, anon')}`;
  for (const role of ['public', 'anon']) {
    for (const marker of ['', '-- allow-anon-grant: fixture\n']) {
      const result = run({
        [LATE]: created,
        [NEXT]: `${marker}grant execute on function public.f(uuid) to ${role};`,
      });
      assert.equal(definerFailures(result).length, 1, `${role} ${marker}`);
      assert.deepEqual(result.satisfied, []);
      // The grant marker exempts only the grant rule, never the definer rule.
      assert.equal(
        result.violations.some((item) => item.rule === RULES.anonGrant),
        marker === ''
      );
    }
  }
});

test('later schema-wide and signature-free grants reopen a post-cutoff definer', () => {
  const created = `${create('public.f')}\n${revoke('public.f(uuid)', 'public, anon')}`;
  for (const grant of [
    'grant execute on all functions in schema public to public;',
    'grant execute on function public.f to anon;',
  ]) {
    const result = run({
      [LATE]: created,
      [NEXT]: `-- allow-anon-grant: fixture\n${grant}`,
    });
    assert.equal(definerFailures(result).length, 1, grant);
  }
});

test('a later revoke in another file never repairs a post-cutoff definer', () => {
  const result = run({
    [LATE]: `${create('public.f')}\ngrant execute on function public.f(uuid) to anon;`,
    [NEXT]: revoke('public.f(uuid)', 'public, anon'),
  });
  assert.equal(definerFailures(result).length, 1);
});

test('later grants to other roles leave a post-cutoff same-file revoke intact', () => {
  const result = run({
    [LATE]: `${create('public.f')}\n${revoke('public.f(uuid)', 'public, anon')}`,
    [NEXT]:
      'grant execute on function public.f(uuid) to authenticated, service_role;',
    [FIXTURE]: 'grant execute on function public.other(uuid) to service_role;',
  });
  assert.deepEqual(result.violations, []);
});

test('a signature-free DROP of a frozen name, then a re-create without a revoke, fails', () => {
  for (const drop of [
    `drop function ${NAME};`,
    `drop function if exists ${NAME} cascade;`,
    `drop routine ${NAME};`,
    `drop procedure ${NAME};`,
    `drop function private.unrelated, ${NAME};`,
  ]) {
    const result = run(frozen(drop));
    assert.equal(definerFailures(result).length, 1, drop);
    assert.deepEqual(result.satisfied, []);
  }
});

test('a signature-free DROP of another name or schema keeps inheritance', () => {
  for (const drop of [
    'drop function public.get_user_workspace_subscription_info_v2;',
    'drop function private.get_user_workspace_subscription_info;',
  ]) {
    assert.deepEqual(run(frozen(drop)).violations, [], drop);
  }
});

test('a signature-free ALTER ... RENAME or SET SCHEMA breaks inheritance', () => {
  for (const alter of [
    `alter function ${NAME} rename to other_name;`,
    `alter routine ${NAME} rename to other_name;`,
    `alter procedure ${NAME} rename to other_name;`,
    `alter function ${NAME} set schema public;`,
  ]) {
    assert.equal(definerFailures(run(frozen(alter))).length, 1, alter);
  }
});

test('a signature-free grant breaks inheritance but cannot supply revoke evidence', () => {
  assert.equal(
    definerFailures(run(frozen(`grant execute on function ${NAME} to anon;`)))
      .length,
    1
  );
  const fixtures = frozen();
  fixtures[EARLY] = `${create(NAME, 'create function')}\n${revoke(NAME)}`;
  assert.equal(definerFailures(run(fixtures)).length, 1);
});

test('a signature-free DROP followed by a fresh exact revoke restores inheritance', () => {
  const middle = `drop function ${NAME};\n${create(NAME, 'create function')}\n${revoke(SIGNATURE)}`;
  assert.deepEqual(run(frozen(middle)).violations, []);
});

test('routineAclEffect treats signature-free targets as every overload', () => {
  const key = 'private.f(uuid,text)';
  const reset = { op: 'reset' };
  assert.deepEqual(routineAclEffect('drop function private.f', key), reset);
  assert.deepEqual(
    routineAclEffect('drop routine if exists private.f cascade', key),
    reset
  );
  assert.deepEqual(
    routineAclEffect('drop procedure private.f(uuid)', key),
    null
  );
  assert.deepEqual(
    routineAclEffect('alter function private.f rename to g', key),
    reset
  );
  assert.deepEqual(
    routineAclEffect('alter function private.f(uuid,text) set schema x', key),
    reset
  );
  assert.deepEqual(routineAclEffect('drop function private.g', key), null);
  assert.deepEqual(
    routineAclEffect('revoke all on function private.f from public', key),
    null
  );
  assert.deepEqual(
    routineAclEffect('grant execute on function private.f to anon', key),
    {
      op: 'grant',
      roles: ['anon'],
    }
  );
});

test('the 030500 rollback restores only service_role access and never grants to PUBLIC or anon', () => {
  const file =
    'apps/database/rollbacks/20261029030500_align_cross_app_token_grant_and_private_fence.rollback.sql';
  const rollback = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.ok(
    rollback.startsWith(
      '-- PUBLIC/anon defaults are intentionally not restored (SR-331 fence; least privilege). See forward migration 20261029030500_align_cross_app_token_grant_and_private_fence.sql.'
    )
  );
  assert.deepEqual(
    evaluateSqlFiles({ files: [file], readFile: () => rollback }).violations,
    []
  );
  // The guard blanks dollar-quoted bodies, so scan the raw code too.
  const code = rollback.replace(/--.*$/gm, '').toLowerCase();
  const grantees = [
    ...code.matchAll(
      /\bgrant\b[\s\S]*?\bto\s+([a-z_, ]+?)(?=['\s;]*(?:;|\$|\)|,\s*pg_get))/g
    ),
  ].map((m) => m[1].trim());
  assert.ok(grantees.length >= 2);
  assert.deepEqual([...new Set(grantees)], ['service_role']);
  assert.ok(!/\bto\s+(?:public|anon)\b/.test(code));
  assert.ok(
    !/\bgrant\b[^;]*\b(?:public|anon)\b(?!\.)/.test(
      code.replace(/revoke[^;]*/g, '')
    )
  );
  assert.ok(!/\bto\s+authenticated\b/.test(code));
});
