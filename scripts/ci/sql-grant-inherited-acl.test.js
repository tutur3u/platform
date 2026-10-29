const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  FROZEN_DEFINERS: INHERITED_ACL_ALLOWLIST,
  FROZEN_DEFINERS_CUTOFF: INHERITED_ACL_CUTOFF,
} = require('./sql-grant-frozen-definers');
const {
  RULES,
  checkRepository,
  evaluateSqlFiles,
  formatSatisfied,
} = require('./sql-grant-guard');

const ROOT = path.resolve(__dirname, '..', '..');
const MIGRATIONS = 'apps/database/supabase/migrations/';
const ROLLBACK =
  'apps/database/rollbacks/20261029012300_tighten_legacy_table_grants.rollback.sql';
const FORWARD = `${MIGRATIONS}20261029012300_tighten_legacy_table_grants.sql`;

const EARLY = `${MIGRATIONS}20261016104000_early.sql`;
const ALLOWED_FILE =
  '20261029010000_restore_employee_readiness_path_contract.sql';
const ALLOWED = `${MIGRATIONS}${ALLOWED_FILE}`;
const SIGNATURE = 'private.employee_creation_runtime_ready(uuid)';

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function definer(signature, body = 'create or replace function') {
  const [name, args] = /^(.+?)\((.*)\)$/.exec(signature).slice(1);
  const params = args
    .split(',')
    .map((type, index) => `p${index} ${type}`)
    .join(', ');
  return `${body} ${name}(${params}) returns void language sql security definer as $$ select $$;`;
}
function revokeAll(signature, roles = 'public, anon, authenticated') {
  return `revoke all on function ${signature} from ${roles};`;
}

function run(fixtures) {
  return evaluateSqlFiles({
    files: Object.keys(fixtures).sort(),
    readFile: (file) => fixtures[file],
  });
}
function definerFailures(result) {
  return result.violations.filter((item) => item.rule === RULES.definerPublic);
}
// An allowlisted replacement after an early revoke, plus extra statements
// between them (`middle`) or after the replacement (`tail`).
function history({
  signature = SIGNATURE,
  file = ALLOWED,
  middle = '',
  tail = '',
} = {}) {
  return {
    [EARLY]: `${definer(signature, 'create function')}\n${revokeAll(signature)}\n${middle}`,
    [file]: `${definer(signature)}\n${tail}`,
  };
}

test('the inherited-ACL allowlist is frozen at the seven reviewed definers', () => {
  assert.deepEqual(
    INHERITED_ACL_ALLOWLIST.map((entry) => [
      entry.key,
      entry.file,
      entry.requiredRevoked,
    ]),
    [
      [
        'private.employee_creation_runtime_ready(uuid)',
        ALLOWED_FILE,
        ['public', 'anon', 'authenticated'],
      ],
      [
        'public.transfer_workspace_ownership(uuid,uuid)',
        '20261029012000_harden_workspace_ownership_guard.sql',
        ['public', 'anon'],
      ],
      [
        'private.create_workspace_email_invitation_with_roles(uuid,text,uuid,workspace_member_type,uuid[])',
        '20261029012100_restrict_subscription_writes.sql',
        ['public', 'anon', 'authenticated'],
      ],
      [
        'private.create_inventory_pos_operator_invite(uuid,uuid,text)',
        '20261029012100_restrict_subscription_writes.sql',
        ['public', 'anon', 'authenticated'],
      ],
      [
        'private.finalize_workspace_invitation_membership_v2(uuid,uuid,workspace_member_type,uuid[])',
        '20261029012100_restrict_subscription_writes.sql',
        ['public', 'anon', 'authenticated'],
      ],
      [
        'private.finalize_workspace_invitation_membership(uuid,uuid,workspace_member_type,uuid)',
        '20261029012100_restrict_subscription_writes.sql',
        ['public', 'anon', 'authenticated'],
      ],
      [
        'public.get_user_workspace_subscription_info(uuid)',
        '20261029030400_align_ai_chat_and_subscription_rpc_access.sql',
        ['public', 'anon', 'authenticated'],
      ],
    ]
  );
  assert.ok(Object.isFrozen(INHERITED_ACL_ALLOWLIST));
  assert.equal(INHERITED_ACL_CUTOFF, '20261029030400');
});

test('an allowlisted replace inherits an earlier revoke and prints its evidence', () => {
  const result = run(history());
  assert.deepEqual(result.violations, []);
  assert.equal(result.satisfied.length, 1);
  const [entry] = result.satisfied;
  assert.equal(entry.mode, 'inherited-acl');
  assert.deepEqual(
    entry.evidence.map((item) => [item.role, item.file]),
    ['public', 'anon', 'authenticated'].map((role) => [role, EARLY])
  );
  const line = formatSatisfied(entry);
  assert.match(
    line,
    new RegExp(
      `${escapeRegExp(ALLOWED)}:1 ${escapeRegExp(SIGNATURE)} inherited ACL`
    )
  );
  assert.match(
    line,
    new RegExp(
      `public, anon, authenticated revoked at ${escapeRegExp(EARLY)}:2`
    )
  );
});

test('inheritance covers a revoke split across migrations and a later service grant', () => {
  const fixtures = history({
    middle: `grant execute on function ${SIGNATURE} to service_role;`,
  });
  assert.deepEqual(run(fixtures).violations, []);
});

test('a non-allowlisted replace with no same-file revoke fails', () => {
  const other = 'private.other_definer(uuid)';
  const result = run(history({ signature: other }));
  assert.equal(definerFailures(result).length, 1);
  assert.deepEqual(result.satisfied, []);
});

test('an allowlisted signature outside its frozen migration gets no inheritance', () => {
  const result = run({
    [EARLY]: history()[EARLY],
    [`${MIGRATIONS}20261029010001_copy.sql`]: definer(SIGNATURE),
  });
  assert.equal(definerFailures(result).length, 1);
});

test('a wrong signature does not count as the prior revoke', () => {
  const fixtures = history();
  fixtures[EARLY] =
    `${definer(SIGNATURE, 'create function')}\n${revokeAll('private.employee_creation_runtime_ready(uuid, text)')}\n${revokeAll('private.employee_creation_runtime_ready')}`;
  assert.equal(definerFailures(run(fixtures)).length, 1);
});

test('the prior revoke must cover public, anon and, where required, authenticated', () => {
  for (const roles of ['public', 'anon', 'public, anon']) {
    const fixtures = history();
    fixtures[EARLY] =
      `${definer(SIGNATURE, 'create function')}\n${revokeAll(SIGNATURE, roles)}`;
    assert.equal(definerFailures(run(fixtures)).length, 1, roles);
  }
});

test('transfer_workspace_ownership keeps authenticated EXECUTE by design', () => {
  const signature = 'public.transfer_workspace_ownership(uuid,uuid)';
  const file = '20261029012000_harden_workspace_ownership_guard.sql';
  const fixtures = {
    [EARLY]: `${definer(signature, 'create function')}\n${revokeAll(signature, 'public, anon')}\ngrant execute on function ${signature} to authenticated;`,
    [`${MIGRATIONS}${file}`]: definer(signature),
  };
  const result = run(fixtures);
  assert.deepEqual(result.violations, []);
  assert.match(
    formatSatisfied(result.satisfied[0]),
    /authenticated EXECUTE retained by design/
  );
});

test('a drop, move or recreation after the revoke breaks inheritance', () => {
  for (const statement of [
    `drop function ${SIGNATURE};`,
    `drop function if exists ${SIGNATURE} cascade;`,
    'drop schema private cascade;',
    `alter function ${SIGNATURE} rename to other_name;`,
    `alter function ${SIGNATURE} set schema public;`,
  ]) {
    assert.equal(
      definerFailures(run(history({ middle: statement }))).length,
      1,
      statement
    );
  }
  // A plain CREATE after a drop is a brand-new function with the default ACL.
  const fixtures = history({
    middle: `drop function ${SIGNATURE};\n${definer(SIGNATURE, 'create function')}`,
  });
  assert.equal(definerFailures(run(fixtures)).length, 1);
});

test('a drop followed by a fresh revoke restores the evidence', () => {
  const middle = `drop function ${SIGNATURE};\n${definer(SIGNATURE, 'create function')}\n${revokeAll(SIGNATURE)}`;
  assert.deepEqual(run(history({ middle })).violations, []);
});

test('a PUBLIC or anon re-grant after the revoke breaks inheritance', () => {
  for (const statement of [
    `grant execute on function ${SIGNATURE} to public;`,
    `grant all on function ${SIGNATURE} to anon;`,
    '-- allow-anon-grant: reviewed fixture\ngrant execute on all functions in schema private to anon;',
    `grant execute on function ${SIGNATURE} to authenticated;`,
  ]) {
    for (const where of ['middle', 'tail']) {
      const result = run(history({ [where]: statement }));
      assert.equal(definerFailures(result).length, 1, `${where}: ${statement}`);
      assert.deepEqual(result.satisfied, []);
    }
  }
});

test('a plain CREATE of an allowlisted signature does not inherit', () => {
  const fixtures = history();
  fixtures[ALLOWED] = definer(SIGNATURE, 'create function');
  assert.equal(definerFailures(run(fixtures)).length, 1);
});

test('a definer after the cutoff needs a same-file revoke, even for an allowlisted signature', () => {
  const late = `${MIGRATIONS}20261030000000_late.sql`;
  const base = history();
  const missing = run({ ...base, [late]: definer(SIGNATURE) });
  assert.equal(definerFailures(missing).length, 1);
  assert.match(
    missing.violations[0].message,
    /need the revoke in the same file/
  );
  assert.equal(
    definerFailures(
      run({
        ...base,
        [late]: definer(SIGNATURE),
        [`${MIGRATIONS}20261030000100_next.sql`]: revokeAll(
          SIGNATURE,
          'public, anon'
        ),
      })
    ).length,
    1
  );
  assert.deepEqual(
    run({
      ...base,
      [late]: `${definer(SIGNATURE)}\n${revokeAll(SIGNATURE, 'public, anon')}`,
    }).violations,
    []
  );
});

// main restated this definer's ACL in a later file (20261029050000), so it is
// now evidenced directly by that revoke instead of by inheritance.
const DIRECTLY_EVIDENCED = new Set([
  'private.employee_creation_runtime_ready(uuid)',
]);

test('the repository passes with every remaining inherited pass evidenced', () => {
  const { violations, satisfied } = checkRepository();
  assert.deepEqual(
    violations.map((violation) => violation.message),
    []
  );
  const inherited = satisfied.filter((entry) => entry.mode === 'inherited-acl');
  assert.deepEqual(
    inherited.map((entry) => entry.signature).sort(),
    INHERITED_ACL_ALLOWLIST.map((entry) => entry.key)
      .filter((key) => !DIRECTLY_EVIDENCED.has(key))
      .sort()
  );
  const direct = satisfied.find((entry) =>
    DIRECTLY_EVIDENCED.has(entry.signature)
  );
  assert.notEqual(direct.mode, 'inherited-acl');
  assert.ok(
    direct.evidence.some((item) =>
      item.file.endsWith('20261029050000_restate_employee_creation_runtime_ready_acl.sql')
    )
  );
  for (const entry of inherited) {
    assert.ok(entry.evidence.every((item) => item.file < entry.file));
  }
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, 'sql-grant-guard.js')],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout.match(/inherited ACL \(frozen allowlist\)/g).length,
    INHERITED_ACL_ALLOWLIST.length - DIRECTLY_EVIDENCED.size
  );
  assert.match(result.stdout, /SQL grant guard passed\./);
});

function privileges(sql, verb) {
  const code = sql.replace(/--.*$/gm, '');
  return [
    ...code.matchAll(
      new RegExp(
        `${escapeRegExp(verb)}\\s+([\\w, ]+?)\\s+on table\\s+([\\s\\S]+?)\\s+(?:to|from)\\s+([\\w, ]+?);`,
        'gi'
      )
    ),
  ].map(([, privilegeList, tables, roles]) => ({
    privileges: privilegeList
      .toLowerCase()
      .split(',')
      .map((item) => item.trim()),
    tables: tables.split(',').map((item) => item.trim()),
    roles: roles
      .toLowerCase()
      .split(',')
      .map((item) => item.trim()),
  }));
}

test('the SR-828 rollback never grants to anon and restores only removed authenticated privileges', () => {
  const rollback = fs.readFileSync(path.join(ROOT, ROLLBACK), 'utf8');
  const forward = fs.readFileSync(path.join(ROOT, FORWARD), 'utf8');
  assert.deepEqual(run({ [ROLLBACK]: rollback }).violations, []);
  assert.match(
    rollback.split('\n').slice(0, 8).join('\n'),
    /anon and TRUNCATE are intentionally not restored/i
  );
  assert.match(rollback, /least privilege/i);

  const grants = privileges(rollback, 'grant');
  assert.ok(grants.length > 0);
  for (const grant of grants) {
    assert.deepEqual(grant.roles, ['authenticated']);
    assert.ok(
      !grant.privileges.some((item) =>
        ['all', 'truncate', 'maintain'].includes(item)
      ),
      grant.privileges.join()
    );
  }
  assert.ok(
    !/\bto\s[^;]*\b(?:anon|public)\b(?!\.)/i.test(
      rollback.replace(/--.*$/gm, '')
    )
  );

  // Rollback grants are exactly the authenticated privileges the forward
  // migration removed, minus TRUNCATE (and MAINTAIN).
  const kept = new Map();
  for (const grant of privileges(forward, 'grant')) {
    for (const table of grant.tables)
      kept.set(table, new Set(grant.privileges));
  }
  const restored = new Map();
  for (const grant of grants) {
    for (const table of grant.tables)
      restored.set(table, new Set(grant.privileges));
  }
  const original = [
    'select',
    'insert',
    'update',
    'delete',
    'references',
    'trigger',
  ];
  assert.deepEqual([...restored.keys()].sort(), [...kept.keys()].sort());
  for (const [table, keptSet] of kept) {
    const expected = original.filter((item) => !keptSet.has(item));
    assert.deepEqual([...restored.get(table)].sort(), expected.sort(), table);
  }
});
