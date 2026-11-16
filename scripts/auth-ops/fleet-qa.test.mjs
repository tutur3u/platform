import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNTS, newReceipt, validateReceipt } from './fleet-qa.mjs';
import { parseArgs } from '../../packages/supabase/ops/fleet-qa.mjs';
import { config, ids, wsids, clock, fixture } from './fleet-qa-fixture.mjs';
test('provision confirms only two aliases with both ownership metadata and no mail/password/admin grant', async () => {
  const f = fixture();
  await f.helper.provision();
  assert.deepEqual(
    f.users.map((u) => u.email),
    Object.values(ACCOUNTS)
  );
  for (const [, args] of f.calls.filter((c) => c[0] === 'create')) {
    assert.deepEqual(Object.keys(args).sort(), [
      'app_metadata',
      'email',
      'email_confirm',
      'user_metadata',
    ]);
    assert.equal(args.email_confirm, true);
    assert.deepEqual(args.app_metadata, args.user_metadata);
    assert.equal(args.app_metadata.qa, 'd241');
  }
  assert.equal(
    f
      .receipt()
      .accounts.every(
        (a) => a.workspaces.length === 1 && a.workspaces[0].personal
      ),
    true
  );
  await assert.rejects(f.helper.provision());
  assert.equal(f.calls.filter((c) => c[0] === 'create').length, 2);
});
test('existing email anywhere aborts before create and never adopts', async () => {
  const f = fixture();
  f.users.push({ email: ACCOUNTS.a2.toUpperCase() });
  await assert.rejects(f.helper.provision(), /ALIAS_LOOKUP_FAILED/);
  assert.equal(
    f.calls.some((c) => c[0] === 'create'),
    false
  );
});
test('unknown create stops without retry and receipt preserves first ID', async () => {
  const f = fixture();
  const create = f.admin.createUser;
  f.admin.createUser = async (args) => {
    if (args.email === ACCOUNTS.a2) throw new Error('sensitive supplier error');
    return create(args);
  };
  await assert.rejects(f.helper.provision(), /STOP_RECONCILIATION/);
  assert.equal(f.receipt().accounts[0].id, ids[0]);
  assert.equal(f.receipt().accounts[1].outcome, 'unknown');
  await assert.rejects(f.helper.provision());
  assert.equal(f.calls.filter((c) => c[0] === 'create').length, 1);
});
test('forged cross-run receipt and invalid labels refuse link and mutations', async () => {
  const f = fixture();
  await f.helper.provision();
  const r = await f.store.read();
  r.runId = '30000000-0000-4000-8000-000000000003';
  await f.store.save(r);
  await assert.rejects(f.helper.login('a1'), /REFUSED/);
  await assert.rejects(f.helper.delete('a1'), /REFUSED/);
  await assert.rejects(f.helper.delete('fleet-qa'), /REFUSED/);
  assert.equal(
    f.calls.some((c) => c[0] === 'link'),
    false
  );
});
test('A2 shared and any unrecorded membership refuse login', async () => {
  const f = fixture();
  await f.helper.provision();
  f.memberships.push({ user_id: ids[1], ws_id: wsids[0] });
  await assert.rejects(f.helper.login('a2'), /REFUSED/);
  assert.throws(() =>
    parseArgs([
      '--custody-directory',
      '/tmp',
      '/tmp/r',
      'record-workspace',
      'a2',
      wsids[0],
    ])
  );
});
test('A1 records one UI-owned nonpersonal workspace only', async () => {
  const f = fixture();
  await f.helper.provision();
  const id = '40000000-0000-4000-8000-000000000004';
  f.workspaces.push({
    id,
    creator_id: ids[0],
    personal: false,
    name: 'QA D241',
    created_at: clock().toISOString(),
  });
  f.memberships.push({ ws_id: id, user_id: ids[0] });
  const r = await f.store.read();
  r.sharedRecords.push({ label: 'a1', id, name: 'QA D241' });
  await f.store.save(r);
  await f.helper.preflight();
  assert.equal(f.receipt().accounts[0].workspaces.length, 1);
  assert.equal(f.receipt().sharedRecords[0].id, id);
});
test('foreign members and mismatched creators block all workspace deletion', async () => {
  for (const alter of [
    (f) => f.memberships.push({ ws_id: wsids[0], user_id: ids[1] }),
    (f) => {
      f.workspaces[0].creator_id = ids[1];
    },
  ]) {
    const f = fixture();
    await f.helper.provision();
    alter(f);
    await assert.rejects(f.helper.delete('a1'), /REFUSED|RECONCILIATION/);
    assert.equal(
      f.calls.some((c) => c[0] === 'table' && c[2] === 'delete'),
      false
    );
    assert.equal(
      f.calls.some((c) => c[0] === 'delete'),
      false
    );
  }
});
test('cleanup revokes through auth deletion without minting a login', async () => {
  const f = fixture();
  await f.helper.provision();
  await f.helper.delete('a1');
  assert.equal(
    f.calls.some((c) => ['signout', 'verify', 'link'].includes(c[0])),
    false
  );
  assert.equal(
    f.receipt().accounts[0].sessionRevocation,
    'auth-delete-cascade'
  );
  assert.equal(
    f.receipt().accounts[0].accessJwtResidual,
    'access-jwt-valid-until-exp'
  );
  assert.equal(JSON.stringify(f.receipt()).includes('synthetic'), false);
});
test('delete fences individual rows and verifies both auth absence forms without token operations', async () => {
  const f = fixture();
  await f.helper.provision();
  const result = await f.helper.delete('a1');
  assert.deepEqual(result, {
    label: 'a1',
    outcome: 'deleted',
    residuals: { users: 0, user_private_details: 0, platform_user_roles: 0 },
  });
  assert.equal(
    f.calls.some((c) => ['link', 'verify', 'signout'].includes(c[0])),
    false
  );
  assert.deepEqual(
    f.calls.find((c) => c[0] === 'table' && c[2] === 'delete')[3],
    [
      ['id', wsids[0]],
      ['creator_id', ids[0]],
    ]
  );
  assert.equal(f.users.length, 1);
  assert.equal(f.workspaces.length, 1);
});
test('generic get error cannot prove deletion absence', async () => {
  const f = fixture();
  await f.helper.provision();
  const get = f.admin.getUserById;
  f.admin.getUserById = (id) =>
    f.users.some((u) => u.id === id)
      ? get(id)
      : Promise.resolve({ error: { code: 'gateway_error', status: 404 } });
  await assert.rejects(f.helper.delete('a1'), /REFUSED|RECONCILIATION/);
  assert.equal(f.receipt().accounts[0].outcome, 'unknown');
});
test('strict schema refuses injected secret fields, duplicate IDs and A2 nonpersonal scope', () => {
  for (const edit of [
    (r) => {
      r.token = 'secret';
    },
    (r) => {
      r.accounts[0].id = 'bad';
    },
    (r) => {
      r.accounts[1].workspaces = [
        { id: wsids[1], creatorId: ids[1], personal: false },
      ];
      r.accounts[1].id = ids[1];
      r.accounts[1].outcome = 'ready';
    },
  ]) {
    const r = newReceipt(config, clock());
    edit(r);
    assert.throws(() => validateReceipt(r));
  }
});
test('CLI import inert, fixed syntax and no email override', () => {
  assert.deepEqual(
    parseArgs([
      '--custody-directory',
      '/tmp',
      '/tmp/nonsecret-receipt',
      'record-workspace',
      'a1',
      wsids[0],
    ]).rest,
    ['a1', wsids[0]]
  );
  for (const args of [
    ['/tmp/r', 'login', ACCOUNTS.a1],
    ['/tmp/r', 'provision', '--email', 'x'],
    ['relative', 'status'],
  ])
    assert.throws(() => parseArgs(['--custody-directory', '/tmp', ...args]));
});
test('unrecorded owned workspace stops before links or deletion', async () => {
  const f = fixture();
  await f.helper.provision();
  f.workspaces.push({
    id: '40000000-0000-4000-8000-000000000004',
    creator_id: ids[0],
    personal: false,
    name: 'Unrecorded',
    created_at: clock().toISOString(),
  });
  await assert.rejects(f.helper.delete('a1'), /REFUSED/);
  assert.equal(
    f.calls.some((c) => c[0] === 'link'),
    false
  );
});
test('successful login exposes only label/port/readiness and fixed magiclink redirect', async () => {
  const f = fixture();
  await f.helper.provision();
  const session = await f.helper.login('a1');
  assert.equal(session.label, 'a1');
  assert.equal(session.port, 12345);
  assert.equal(session.outcome, 'ready');
  assert.equal(JSON.stringify(session).includes('synthetic'), false);
  assert.deepEqual(f.calls.find((c) => c[0] === 'link')[1], {
    type: 'magiclink',
    email: ACCOUNTS.a1,
    options: { redirectTo: 'https://tuturuuu.com/login' },
  });
});
test('forged receipt ACK and project fail before supplier reads', async () => {
  for (const field of ['ack', 'projectRef']) {
    const f = fixture();
    await f.helper.provision();
    const r = await f.store.read();
    r[field] = field === 'ack' ? 'D241_OTHER_ACK' : 'tsrqponmlkjihgfedcba';
    await f.store.save(r);
    const before = f.calls.length;
    await assert.rejects(f.helper.delete('a1'), /REFUSED/);
    assert.equal(f.calls.length, before);
  }
});
test('postdelete email lookup must also be empty', async () => {
  const f = fixture();
  await f.helper.provision();
  const list = f.admin.listUsers;
  f.admin.listUsers = async (args) => {
    if (!f.users.some((u) => u.id === ids[0]))
      return { data: { users: [{ email: ACCOUNTS.a1 }] } };
    return list(args);
  };
  await assert.rejects(f.helper.delete('a1'), /REFUSED|RECONCILIATION/);
  assert.equal(f.receipt().accounts[0].outcome, 'unknown');
});
test('link response identity mismatch never reaches listener or OTP', async () => {
  const f = fixture();
  await f.helper.provision();
  const link = f.admin.generateLink;
  f.admin.generateLink = async (args) => {
    const r = await link(args);
    return { data: { ...r.data, user: f.users[1] } };
  };
  await assert.rejects(f.helper.login('a1'), /REFUSED|RECONCILIATION/);
  assert.equal(
    f.calls.some((c) => c[0] === 'verify'),
    false
  );
});
test('the package wrapper refuses both credential phases before receipt or provider access', async () => {
  const { main } = await import('../../packages/supabase/ops/fleet-qa.mjs');
  for (const phase of ['execution', 'cleanup'])
    await assert.rejects(
      main([
        '--custody-directory',
        '/unavailable',
        '/unavailable/synthetic-receipt',
        phase,
      ]),
      /DIRECT_HELPER_REQUIRED/
    );
});

test('cleanup respects the personal workspace deletion trigger and the auth membership cascade', async () => {
  for (const cascadePersonal of [false, true]) {
    const f = fixture({ cascadePersonal });
    await f.helper.provision();
    await f.helper.delete('a1');
    const authDelete = f.calls.findIndex((c) => c[0] === 'delete');
    assert.ok(authDelete >= 0);
    const personalDeletes = f.calls.flatMap((c, index) =>
      c[0] === 'table' && c[1] === 'workspaces' && c[2] === 'delete'
        ? [{ filters: c[3], index }]
        : []
    );
    assert.equal(personalDeletes.length, cascadePersonal ? 0 : 1);
    for (const call of personalDeletes) {
      assert.ok(call.index > authDelete);
      assert.deepEqual(call.filters, [
        ['id', wsids[0]],
        ['creator_id', ids[0]],
      ]);
    }
    assert.equal(
      f.workspaces.some((w) => w.creator_id === ids[0]),
      false
    );
    assert.equal(
      f.memberships.some((m) => m.user_id === ids[0]),
      false
    );
    assert.equal(f.receipt().accounts[0].outcome, 'deleted');
  }
});

test('cleanup never generates or consumes a login token', async () => {
  const f = fixture({ guardPersonal: false });
  await f.helper.provision();
  await f.helper.delete('a1');
  assert.deepEqual(
    f.calls.filter((c) => ['link', 'verify', 'signout'].includes(c[0])),
    []
  );
});
test('cleanup group fences reject altered personal type and all four shared mismatches before mutation', async () => {
  const sharedId = '40000000-0000-4000-8000-000000000004';
  for (const alter of [
    (w) => {
      w.creator_id = ids[1];
    },
    (w) => {
      w.created_at = '2020-01-01';
    },
    (w) => {
      w.name = 'Customer';
    },
    (w) => {
      w.personal = true;
    },
    (w) => {
      w.id = wsids[1];
    },
  ]) {
    const f = fixture();
    await f.helper.provision();
    const r = await f.store.read();
    r.sharedRecords.push({ label: 'a1', id: sharedId, name: 'QA D241' });
    await f.store.save(r);
    const w = {
      id: sharedId,
      creator_id: ids[0],
      personal: false,
      name: 'QA D241 smoke',
      created_at: clock().toISOString(),
    };
    f.workspaces.push(w);
    f.memberships.push({ ws_id: sharedId, user_id: ids[0] });
    alter(w);
    await assert.rejects(f.helper.preflight());
    assert.equal(
      f.calls.some(
        (c) =>
          c[0] === 'link' ||
          c[0] === 'delete' ||
          (c[0] === 'table' && c[2] === 'delete')
      ),
      false
    );
  }
  for (const index of [0, 1]) {
    const f = fixture();
    await f.helper.provision();
    f.workspaces[index].personal = false;
    await assert.rejects(f.helper.preflight());
    assert.equal(
      f.calls.some((c) => c[0] === 'link'),
      false
    );
  }
});
test('cleanup can remove personal inventory and verified A1 shared record with both row filters', async () => {
  const f = fixture();
  await f.helper.provision();
  const id = '40000000-0000-4000-8000-000000000004';
  const r = await f.store.read();
  r.sharedRecords.push({ label: 'a1', id, name: 'QA D241' });
  await f.store.save(r);
  f.workspaces.push({
    id,
    creator_id: ids[0],
    personal: false,
    name: 'QA D241 smoke',
    created_at: clock().toISOString(),
  });
  f.memberships.push({ ws_id: id, user_id: ids[0] });
  await f.helper.preflight();
  await f.helper.delete('a1');
  const deletes = f.calls.filter((c) => c[0] === 'table' && c[2] === 'delete');
  assert.equal(deletes.length, 2);
  assert.deepEqual(deletes[0][3], [
    ['id', id],
    ['creator_id', ids[0]],
  ]);
  assert.deepEqual(deletes[1][3], [
    ['id', wsids[0]],
    ['creator_id', ids[0]],
  ]);
  const userDelete = f.calls.findIndex((c) => c[0] === 'delete');
  assert.ok(f.calls.indexOf(deletes[0]) < userDelete);
  assert.ok(f.calls.indexOf(deletes[1]) > userDelete);
  assert.equal(f.workspaces.length, 1);
});
test('shared record cannot change personal inventory or carry arbitrary names/data', () => {
  for (const record of [
    { label: 'a2', id: wsids[0], name: 'QA D241' },
    { label: 'a1', id: wsids[0], name: 'QA D241 secret' },
    { label: 'a1', id: 'bad', name: 'QA D241' },
    { label: 'a1', id: wsids[0], name: 'QA D241', token: 'secret' },
  ]) {
    const r = newReceipt(config, clock());
    r.sharedRecords.push(record);
    assert.throws(() => validateReceipt(r));
  }
});
test('cleanup validates both identities before deleting either and never mints tokens', async () => {
  const f = fixture();
  await f.helper.provision();
  await f.helper.preflight();
  await f.helper.delete('a1');
  await f.helper.delete('a2');
  const first = f.calls.findIndex((c) => c[0] === 'delete');
  assert.ok(
    f.calls.findIndex((c) => c[0] === 'get' && c[1] === ids[1]) < first
  );
  assert.equal(
    f.calls.some((c) => ['link', 'verify', 'signout'].includes(c[0])),
    false
  );
  assert.equal(f.users.length, 0);
  assert.equal(f.workspaces.length, 0);
  assert.equal(f.memberships.length, 0);
});
test('alias-only tombstones are counted without purging; nonalias residuals retain unknown outcome', async () => {
  for (const invalid of [false, true]) {
    const f = fixture();
    await f.helper.provision();
    f.profiles.users.push({
      id: ids[0],
      display_name: invalid ? 'Foreign profile' : 'A1',
      avatar_url: null,
      banner_url: null,
      bio: null,
      handle: null,
    });
    f.profiles.user_private_details.push({
      user_id: ids[0],
      deleted: true,
      email: ACCOUNTS.a1,
      full_name: null,
      birthday: null,
      new_email: null,
    });
    if (invalid) {
      await assert.rejects(f.helper.delete('a1'));
      assert.equal(f.receipt().accounts[0].outcome, 'unknown');
      assert.equal(f.receipt().accounts[0].residuals, null);
    } else {
      const d = await f.helper.delete('a1');
      assert.deepEqual(d.residuals, {
        users: 1,
        user_private_details: 1,
        platform_user_roles: 0,
      });
    }
    assert.equal(f.profiles.users.length, 1);
    assert.equal(f.profiles.user_private_details.length, 1);
    assert.equal(
      f.calls.some(
        (c) =>
          c[0] === 'table' &&
          ['users', 'user_private_details'].includes(c[1]) &&
          c[2] === 'delete'
      ),
      false
    );
  }
});

test('pending email roles on either alias stop before creating any account', async () => {
  for (const label of ['a1', 'a2']) {
    const f = fixture();
    f.profiles.platform_email_roles = [{ email: ACCOUNTS[label] }];
    await assert.rejects(f.helper.provision(), /REFUSED/);
    assert.equal(
      f.calls.some((c) => c[0] === 'create'),
      false
    );
  }
});

test('unexpected platform privileges after creation stop before any login', async () => {
  const f = fixture();
  const create = f.admin.createUser;
  f.admin.createUser = async (args) => {
    const result = await create(args);
    f.profiles.platform_user_roles = [
      { user_id: result.data.user.id, enabled: true },
    ];
    return result;
  };
  await assert.rejects(f.helper.provision(), /RECONCILIATION/);
  assert.equal(f.receipt().accounts[0].id, ids[0]);
  assert.equal(
    f.calls.some((c) => c[0] === 'link'),
    false
  );
});

test('login failure remains cleanup-eligible only while owned identity matches', async () => {
  const f = fixture();
  await f.helper.provision();
  f.admin.generateLink = async () => {
    throw new Error('synthetic failure');
  };
  await assert.rejects(f.helper.login('a1'), /RECONCILIATION/);
  assert.equal(f.receipt().accounts[0].outcome, 'login-failed');
  await f.helper.delete('a1');
  assert.equal(f.receipt().accounts[0].outcome, 'deleted');
});
