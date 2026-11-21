// Run only against a disposable local Supabase PG17 container. Two real
// sessions settle the same chat message at once and must charge it once:
// on one wallet they serialize on its row lock; on two wallets the second
// meets the unique index and returns the first one's deduction.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

const container = process.argv[2];
assert.match(container ?? '', /^supabase_db_tt-/);
const args = [
  'exec',
  '-i',
  container,
  'psql',
  '-U',
  'postgres',
  '-d',
  'postgres',
  '-X',
  '-qAt',
  '-v',
  'ON_ERROR_STOP=1',
];

function sql(text) {
  const result = spawnSync('docker', args, { input: text, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

// A psql session that stays open; `until` resolves when a marker is printed.
function session() {
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  let errors = '';
  const waiters = [];
  child.stdout.on('data', (data) => {
    output += data;
    for (const waiter of [...waiters]) {
      if (output.includes(waiter.marker)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(output);
      }
    }
  });
  child.stderr.on('data', (data) => {
    errors += data;
  });
  child.on('exit', (code) => {
    for (const waiter of waiters)
      waiter.reject(new Error(`session exited (${code}): ${errors}`));
  });
  return {
    child,
    send: (text) => child.stdin.write(text),
    until: (marker) =>
      output.includes(marker)
        ? Promise.resolve(output)
        : new Promise((resolve, reject) =>
            waiters.push({ marker, resolve, reject })
          ),
    output: () => output,
    close: async () => {
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit');
      child.stdin.end('rollback;\n');
      await exited;
    },
  };
}

async function waitForLockWait(applicationName) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const waiting = sql(`select count(*) from pg_stat_activity
      where application_name = '${applicationName}' and wait_event_type = 'Lock';`);
    if (waiting === '1') return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`${applicationName} never waited on a lock`);
}

const id = (n) => `33000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [userA, userB, workspace, chat] = [id(1), id(2), id(10), id(100)];
const [crossMessage, sameMessage] = [id(201), id(202)];

const charge = (
  message,
  user
) => `select success || ':' || credits_deducted::numeric(14, 4)
  from public.deduct_ai_credits(
    p_ws_id => '${workspace}', p_model_id => 'google/gemini-3.1-flash-lite',
    p_input_tokens => 1000, p_output_tokens => 500, p_feature => 'chat',
    p_chat_message_id => '${message}', p_user_id => '${user}');`;
const deductions = (message) =>
  sql(`select count(*) from public.ai_credit_transactions
    where chat_message_id = '${message}' and transaction_type = 'deduction';`);
const used = (user) =>
  sql(`select coalesce(sum(total_used), 0) from public.workspace_ai_credit_balances
    where user_id = '${user}' and ws_id is null;`);

const sessions = [];
let checks = 0;
try {
  sql(`insert into public.users (id, display_name) values
      ('${userA}', 'Race A'), ('${userB}', 'Race B');
    insert into public.workspaces (id, name, creator_id, personal)
      values ('${workspace}', 'Race workspace', '${userA}', false);
    insert into public.ai_chats (id, title, creator_id)
      values ('${chat}', 'race', '${userA}');
    insert into public.ai_chat_messages (id, chat_id, content, creator_id, role) values
      ('${crossMessage}', '${chat}', 'x', '${userA}', 'ASSISTANT'),
      ('${sameMessage}', '${chat}', 'y', '${userA}', 'ASSISTANT');
    select 1 from public.get_or_create_credit_balance('${workspace}', '${userA}');
    select 1 from public.get_or_create_credit_balance('${workspace}', '${userB}');
    update public.workspace_ai_credit_balances
       set total_allocated = 100000, bonus_credits = 0, total_used = 0
     where user_id in ('${userA}', '${userB}') and ws_id is null;`);

  // Two wallets: B cannot see A's uncommitted row, so it reaches the insert
  // and waits on the unique index until A commits.
  const first = session();
  const second = session();
  sessions.push(first, second);
  first.send(`begin;\n${charge(crossMessage, userA)}\n\\echo FIRST_CHARGED\n`);
  const firstResult = (await first.until('FIRST_CHARGED')).split('\n')[0];
  const usedBefore = used(userB);
  second.send(
    `set application_name = 'race_second';\n${charge(crossMessage, userB)}\n\\echo SECOND_DONE\n`
  );
  await waitForLockWait('race_second');
  first.send('commit;\n\\echo FIRST_COMMITTED\n');
  await first.until('FIRST_COMMITTED');
  const secondOutput = await second.until('SECOND_DONE');
  const secondResult = secondOutput
    .split('\n')
    .find((line) => line.includes(':'));

  assert.match(firstResult, /^true:\d/, 'first settlement charges');
  checks++;
  assert.equal(
    secondResult,
    firstResult,
    'second wallet returns the first charge'
  );
  checks++;
  assert.equal(
    deductions(crossMessage),
    '1',
    'one deduction across two wallets'
  );
  checks++;
  assert.equal(used(userB), usedBefore, 'the second wallet is not charged');
  checks++;

  // One wallet: B waits on the wallet row lock, then sees A's committed row.
  const third = session();
  const fourth = session();
  sessions.push(third, fourth);
  third.send(`begin;\n${charge(sameMessage, userA)}\n\\echo THIRD_CHARGED\n`);
  const thirdResult = (await third.until('THIRD_CHARGED')).split('\n')[0];
  fourth.send(
    `set application_name = 'race_fourth';\n${charge(sameMessage, userA)}\n\\echo FOURTH_DONE\n`
  );
  await waitForLockWait('race_fourth');
  const usedAfterFirst =
    sql(`select total_used from public.workspace_ai_credit_balances
    where user_id = '${userA}' and ws_id is null;`);
  third.send('commit;\n\\echo THIRD_COMMITTED\n');
  await third.until('THIRD_COMMITTED');
  const fourthOutput = await fourth.until('FOURTH_DONE');
  const fourthResult = fourthOutput
    .split('\n')
    .find((line) => line.includes(':'));

  assert.equal(
    fourthResult,
    thirdResult,
    'same wallet returns the first charge'
  );
  checks++;
  assert.equal(deductions(sameMessage), '1', 'one deduction on one wallet');
  checks++;
  assert.ok(
    Number(used(userA)) > Number(usedAfterFirst),
    'the committed first charge is the only one on the wallet'
  );
  checks++;

  console.log(
    `PASS: cross-wallet and same-wallet races charge each chat message once (${checks} assertions)`
  );
} finally {
  for (const s of sessions) await s.close();
  sql(`delete from public.ai_credit_transactions
      where chat_message_id in ('${crossMessage}', '${sameMessage}');
    delete from public.workspace_ai_credit_balances
      where user_id in ('${userA}', '${userB}') and ws_id is null;
    delete from public.ai_chats where id = '${chat}';
    delete from public.workspaces where id = '${workspace}';
    delete from public.workspace_members where user_id in ('${userA}', '${userB}');
    delete from public.workspaces where creator_id in ('${userA}', '${userB}');
    delete from public.users where id in ('${userA}', '${userB}');`);
}
