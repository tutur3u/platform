import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'mail-read-concurrency-'));
const data = join(root, 'data');
const socket = join(root, 'socket');
await mkdir(socket, { mode: 0o700 });
const args = [
  '-X',
  '-v',
  'ON_ERROR_STOP=1',
  '-h',
  socket,
  '-p',
  '25444',
  '-U',
  userInfo().username,
  '-d',
  'postgres',
];
const children = new Set();
let started = false;
const sql = async (text) => {
  const child = spawn('psql', [...args, '-At'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  children.add(child);
  let output = '';
  let error = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    error += chunk;
  });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      children.delete(child);
      if (code === 0) resolve(output.trim());
      else
        reject(new Error(`Fixture SQL exit ${code}: ${error.slice(0, 1000)}`));
    });
  });
  child.stdin.end(text);
  return done;
};

async function hold(text) {
  const child = spawn('psql', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  children.add(child);
  let output = '';
  let error = '';
  let ready;
  const waiting = new Promise((resolve) => {
    ready = resolve;
  });
  child.stdout.on('data', (chunk) => {
    output += chunk;
    if (output.includes('D344_READY')) ready();
  });
  child.stderr.on('data', (chunk) => {
    error += chunk;
  });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      children.delete(child);
      if (code === 0) resolve();
      else reject(new Error(`Holder exit ${code}: ${error.slice(0, 1000)}`));
    });
  });
  child.stdin.write(`begin; ${text}\n\\echo D344_READY\n`);
  await Promise.race([
    waiting,
    done.then(() => {
      throw new Error('Holder closed before ready');
    }),
  ]);
  return {
    commit: () => {
      child.stdin.end('commit;\n');
      return done;
    },
  };
}

async function waitForAdvisoryWaiter() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const blocked = await sql(`select count(*) from pg_catalog.pg_stat_activity
      where application_name='d344-waiter' and wait_event_type='Lock' and wait_event='advisory';`);
    if (blocked === '1') return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Concurrent fixture did not block on the read-state lock');
}

const user = '00000000-0000-4000-8000-000000000001';
const message = '00000000-0000-4000-8000-000000000010';
const mailbox = '00000000-0000-4000-8000-000000000020';
const read = `insert into private.mail_message_user_state(message_id,user_id,mailbox_id,read_at) values('${message}','${user}','${mailbox}',now());`;
const trash = `insert into private.mail_message_user_state(message_id,user_id,mailbox_id,trashed_at) values('${message}','${user}','${mailbox}',now());`;
const consumed = `insert into private.mail_message_user_state(message_id,user_id,mailbox_id,notification_consumed_at) values('${message}','${user}','${mailbox}',now());`;
const notification = `insert into public.notifications values(
  '00000000-0000-4000-8000-000000000100','${user}','${message}','mail_message','user',null,'mail_received',
  jsonb_build_object('mailboxId','${mailbox}','messageId','${message}','userId','${user}'),null);`;
const watchdog = setTimeout(() => {
  for (const child of children) child.kill('SIGTERM');
}, 60_000);
try {
  await run('initdb', ['-D', data, '--auth=trust', '--no-locale'], {
    timeout: 15_000,
  });
  await run(
    'pg_ctl',
    [
      '-D',
      data,
      '-l',
      join(root, 'postgres.log'),
      '-o',
      `-k ${socket} -p 25444 -c listen_addresses= -c statement_timeout=15000 -c lock_timeout=10000`,
      '-w',
      'start',
    ],
    { timeout: 15_000 }
  );
  started = true;
  await sql(`create schema private; create role anon; create role authenticated; create role service_role;
    create table private.mail_message_user_state(message_id uuid,user_id uuid,mailbox_id uuid,read_at timestamptz,archived_at timestamptz,trashed_at timestamptz,primary key(message_id,user_id));
    create table public.notifications(id uuid,user_id uuid,entity_id uuid,entity_type text,scope text,ws_id uuid,type text,data jsonb,read_at timestamptz);`);
  await sql(
    await readFile(
      new URL(
        '../supabase/migrations/20261119003000_reconcile_mail_notification_reads.sql',
        import.meta.url
      ),
      'utf8'
    )
  );
  for (const [name, first, second] of [
    ['read commits before notification', read, notification],
    ['notification commits before read', notification, read],
    ['trash commits before notification', trash, notification],
    ['notification commits before trash', notification, trash],
    ['consumption commits before notification', consumed, notification],
    ['notification commits before consumption', notification, consumed],
  ]) {
    await sql('truncate public.notifications,private.mail_message_user_state;');
    const holder = await hold(first);
    const waiter = sql(`set application_name='d344-waiter'; ${second}`);
    // The final await still reports errors; attach a handler while inspecting
    // contention so an early SQL failure cannot skip cleanup.
    void waiter.catch(() => undefined);
    // Observe actual lock contention, rather than relying on a timed sleep.
    await waitForAdvisoryWaiter();
    await holder.commit();
    await waiter;
    assert.equal(
      await sql(
        'select count(*) from public.notifications where read_at is not null;'
      ),
      '1'
    );
    console.log(`ok - ${name}`);
  }
} finally {
  clearTimeout(watchdog);
  for (const child of children) child.kill('SIGTERM');
  if (started)
    await run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'], {
      timeout: 10_000,
    });
  await rm(root, { recursive: true, force: true });
}
console.log(
  JSON.stringify({
    assertions: 6,
    failures: 0,
    postgres: 'native',
    schema: 'synthetic',
    migration: 'real',
    productionWrites: 0,
    cleanup: 'complete',
  })
);
