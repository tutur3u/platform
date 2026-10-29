import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';

export async function runChatFirstMessageRace(metadata) {
  const container = `supabase_db_${metadata.projectId}`;
  const args = [
    'exec',
    '-i',
    container,
    'psql',
    '-X',
    '-A',
    '-t',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'supabase_admin',
    '--dbname',
    'postgres',
  ];
  const sql = (input) =>
    execFileSync('docker', args, { input, encoding: 'utf8', timeout: 10_000 });
  const actor = 'a6742999-0000-4000-8000-000000000002';
  const ws = 'a6742999-0000-4000-8000-000000000011';
  const id = 'a6742999-0000-4000-8000-000000000021';
  const key = 'a6742999-0000-4000-8000-000000000031';
  sql(`insert into public.users(id) values ('${actor}');
    insert into public.workspaces(id,name,creator_id) values ('${ws}','Creation race','${actor}');`);
  const input = JSON.stringify({
    id,
    creationRequestId: key,
    type: 'ai',
    modelId: 'google/test',
    initialAiSettings: {
      modelId: 'google/test',
      creditSource: 'workspace',
      creditWsId: null,
      thinkingMode: 'fast',
    },
  });
  const call = `select private.chat_create_ai_first_message('${ws}','${actor}','${input}'::jsonb,'Concurrent first message');`;
  function session() {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (data) => {
      stdout += data;
    });
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    const finished = new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`Race connection failed (${code}): ${stderr}`))
      );
    });
    // Attach immediately: failures while observing the other connection must not
    // become unhandled rejections or leave an unowned backend running.
    finished.catch(() => {});
    return { child, finished, output: () => stdout };
  }
  const holder = session();
  const contender = session();
  const until = async (read, description) => {
    for (let i = 0; i < 100; i++) {
      const value = read();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Race observation missing: ${description}`);
  };
  try {
    holder.child.stdin.write(
      `begin; set local statement_timeout='10s'; select 'HOLDER:' || pg_backend_pid(); ${call}\nselect 'HOLDER_READY';\n`
    );
    await until(
      () => holder.output().includes('HOLDER_READY'),
      'holder created inside transaction'
    );
    const holderPid = /HOLDER:(\d+)/u.exec(holder.output())?.[1];
    assert.ok(holderPid);
    contender.child.stdin.write(
      `begin; set local statement_timeout='10s'; select 'CONTENDER:' || pg_backend_pid(); ${call}\ncommit;\n`
    );
    const contenderPid = await until(
      () => /CONTENDER:(\d+)/u.exec(contender.output())?.[1],
      'contender PID'
    );
    await until(
      () =>
        sql(`select exists(select 1 from pg_stat_activity where pid=${Number(contenderPid)}
      and wait_event='advisory' and ${Number(holderPid)}=any(pg_blocking_pids(pid)));`).trim() ===
        't',
      'contender blocked by holder advisory lock'
    );
    console.log(
      `Creation race: contender ${contenderPid} observed blocked by holder ${holderPid}`
    );
    holder.child.stdin.end('commit;\n');
    contender.child.stdin.end();
    await Promise.all([holder.finished, contender.finished]);
    const receipt = (output) =>
      output
        .split('\n')
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line))[0];
    const first = receipt(holder.output()),
      second = receipt(contender.output());
    assert.ok(first && second);
    assert.deepEqual(first.creationReceipt, second.creationReceipt);
    assert.equal(first.message.id, second.message.id);
    assert.equal(first.replayed, false);
    assert.equal(second.replayed, true);
    const counts = sql(`select json_build_object(
      'conversations',(select count(*) from private.chat_conversations where id='${id}'),
      'messages',(select count(*) from private.chat_messages where conversation_id='${id}'),
      'owners',(select count(*) from private.chat_conversation_members where conversation_id='${id}'),
      'settings',(select count(*) from private.chat_conversation_ai_settings where conversation_id='${id}'),
      'receipts',(select count(*) from private.chat_creation_requests where conversation_id='${id}'),
      'audits',(select count(*) from private.chat_audit_events where conversation_id='${id}' and event_type='conversation.created'));`);
    assert.deepEqual(JSON.parse(counts), {
      conversations: 1,
      messages: 1,
      owners: 1,
      settings: 1,
      receipts: 1,
      audits: 1,
    });
    console.log(
      'Creation concurrency PASS: one conversation, user message, owner, settings, receipt and creation audit'
    );
  } finally {
    for (const connection of [holder, contender]) {
      if (connection.child.exitCode === null) {
        if (!connection.child.stdin.writableEnded)
          connection.child.stdin.end('rollback;\n');
        connection.child.kill('SIGTERM');
      }
    }
    await Promise.allSettled([holder.finished, contender.finished]);
  }
}
