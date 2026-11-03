// Run only against a disposable local PG17 container. Uses two real sessions.
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
const user = 'a15e0000-0000-4000-8000-00000000f001';
const workspace = 'a15e0000-0000-4000-8000-00000000f002';
let locker;
try {
  sql(`insert into public.users(id,display_name) values ('${user}','Lock fixture');
    insert into public.workspaces(id,name,creator_id) values ('${workspace}','Lock fixture','${user}');
    insert into private.ai_studio_runs(id,request_id,ws_id,model_id,feature,status,created_at)
    select ('a15e0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
      'lock-'||n, '${workspace}', 'fixture','fixture','succeeded',now()-make_interval(days=>500-n)
    from generate_series(1,3) n;`);
  locker = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  const ready = new Promise((resolve, reject) => {
    let output = '';
    locker.stdout.on('data', (data) => {
      output += data;
      if (output.includes('LOCKS_READY')) resolve();
    });
    locker.on('exit', (code) =>
      reject(new Error(`Locker exited before ready: ${code}`))
    );
    locker.on('error', reject);
  });
  locker.stdin.write(
    "begin; select id from private.ai_studio_runs where request_id in ('lock-1','lock-2') order by created_at for update;\n\\echo LOCKS_READY\n"
  );
  await ready;
  const batch = JSON.parse(
    sql('select private.cleanup_ai_studio_retention_batch(1);')
  );
  assert.equal(batch.run_rows, 1, 'skip locked oldest rows before limiting');
  assert.equal(
    sql(
      "select count(*) from private.ai_studio_runs where request_id='lock-3';"
    ),
    '0',
    'later unlocked row removed'
  );
  const exhausted = JSON.parse(
    sql('select private.cleanup_ai_studio_retention_batch(1);')
  );
  assert.equal(exhausted.state, 'locked', 'lock exhaustion differs from done');
  console.log(
    'PASS: two sessions, skip locked then limit; later row removed; lock exhaustion distinct (3 assertions)'
  );
} finally {
  if (locker && locker.exitCode === null) {
    const exited = once(locker, 'exit');
    locker.stdin.end('rollback;\n');
    await exited;
  }
  sql(`delete from public.workspaces where creator_id='${user}';
    delete from public.workspace_members where user_id='${user}';
    delete from public.users where id='${user}';`);
}
