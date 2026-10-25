import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';

const container = process.argv[2];
if (!container || !/^supabase_db_tt-[a-z0-9-]+$/u.test(container)) {
  throw new Error(
    'Pass the database container of an owned disposable tt project'
  );
}

const clients = new Set();
function connect(name) {
  const process = spawn(
    'docker',
    [
      'exec',
      '-i',
      '-e',
      `PGAPPNAME=${name}`,
      container,
      'psql',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'], signal: AbortSignal.timeout(60_000) }
  );
  const state = { process, output: '', diagnostic: '', ready: false };
  clients.add(state);
  process.stdout.on('data', (chunk) => {
    state.output = (state.output + chunk.toString()).slice(-65536);
    state.ready ||= state.output.split(/\r?\n/u).includes('PW_READY');
  });
  process.stderr.on('data', (chunk) => {
    state.diagnostic = (state.diagnostic + chunk.toString()).slice(-2048);
  });
  state.done = new Promise((resolve) => {
    process.on('error', () => resolve({ code: 1, state }));
    process.on('close', (code) => {
      clients.delete(state);
      resolve({ code, state });
    });
  });
  process.stdin.on('error', () => {});
  process.stdin.write('\\set VERBOSITY sqlstate\n');
  return state;
}

async function query(sql, name = `pw-observer-${randomUUID()}`) {
  const client = connect(name);
  client.process.stdin.end(`${sql}\n`);
  return client.done;
}

function succeeded(result) {
  assert.equal(result.code, 0, 'Disposable SQL command failed');
  return result.state.output.trim();
}

async function waitUntil(check, message) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await pause(100);
  }
  throw new Error(message);
}

const owner = randomUUID();
const viewer = randomUUID();
const workspace = randomUUID();
const vault = randomUUID();
const item = randomUUID();

function operation(action, input, actor = owner) {
  const body = JSON.stringify(input).replaceAll("'", "''");
  return `SELECT private.password_vault_execute('${workspace}', '${vault}',
    '${actor}', '${randomUUID()}', '${action}', '${body}'::jsonb) IS NOT NULL;`;
}

async function contend(holderSql, contenderSql, expectedState) {
  const holder = connect(`pw-holder-${randomUUID()}`);
  holder.process.stdin.write(
    `BEGIN; SET LOCAL ROLE service_role;\n${holderSql}\nSELECT 'PW_READY';\n`
  );
  await waitUntil(
    () => holder.ready,
    'Holder did not reach its transaction fence'
  );
  const contenderName = `pw-contender-${randomUUID()}`;
  const contender = connect(contenderName);
  contender.process.stdin.end(`SET ROLE service_role;\n${contenderSql}\n`);
  await waitUntil(async () => {
    const observed = succeeded(
      await query(`SELECT count(*) FROM pg_stat_activity
      WHERE application_name = '${contenderName}' AND wait_event_type = 'Lock';`)
    );
    return observed === '1';
  }, 'Competitor never exhibited an observed database lock wait');
  holder.process.stdin.end('COMMIT;\n');
  succeeded(await holder.done);
  const result = await contender.done;
  assert.notEqual(
    result.code,
    0,
    'A blocked competitor unexpectedly succeeded'
  );
  assert.match(
    result.state.diagnostic,
    new RegExp(`\\b${expectedState}\\b`, 'u'),
    'Competitor returned a different SQLSTATE'
  );
}

try {
  // Only synthetic envelopes are used; cryptographic validity is tested by the service.
  succeeded(
    await query(`BEGIN;
    SELECT set_config('request.jwt.claims', '{}', true);
    INSERT INTO auth.users(id, email, email_confirmed_at) VALUES
      ('${owner}', 'pw-race-${owner}@example.test', now()),
      ('${viewer}', 'pw-race-${viewer}@example.test', now());
    INSERT INTO public.workspaces(id, name, personal, creator_id)
      VALUES ('${workspace}', 'Disposable Passwords contention fixture', false, '${owner}');
    INSERT INTO public.workspace_members(ws_id, user_id, type)
      VALUES ('${workspace}', '${viewer}', 'MEMBER');
    SET LOCAL ROLE service_role;
    ${operation('vault.create', { label: 'Contention fixture', encrypted_data_key: 'k'.repeat(64) })}
    ${operation('member.set', { expected_revision: 1, user_id: viewer, role: 'viewer', revoked: false })}
    ${operation('vault.rotate', { expected_revision: 2, encrypted_data_key: 'r'.repeat(64), items: [] })}
    ${operation('item.write', {
      expected_revision: 3,
      item_id: item,
      expected_item_revision: 0,
      version: 2,
      name: 'RACE_FIXTURE',
      encrypted_payload: 'x'.repeat(64),
      ciphertext_bytes: 64,
    })}
    COMMIT;`)
  );

  const write = {
    expected_revision: 4,
    item_id: item,
    expected_item_revision: 1,
    version: 2,
    name: 'RACE_FIXTURE',
    encrypted_payload: 'y'.repeat(64),
    ciphertext_bytes: 64,
  };
  await contend(
    operation('item.write', write),
    operation('item.write', write),
    '40001'
  );
  console.log('PASS: observed CAS lock contention rejects the stale writer');

  await contend(
    operation('member.set', {
      expected_revision: 5,
      user_id: viewer,
      role: 'viewer',
      revoked: true,
    }),
    operation('item.read', { item_id: item }, viewer),
    '42501'
  );
  console.log(
    'PASS: observed revocation lock contention denies the later read'
  );
} finally {
  for (const client of clients) client.process.stdin.end('ROLLBACK;\n');
  await Promise.allSettled([...clients].map((client) => client.done));
}
