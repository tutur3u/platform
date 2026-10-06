import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  deriveIsolatedIdentity,
  readLifecycleMetadata,
} from './run-supabase-isolated.js';

const config =
  '{"focus_minutes":25,"short_break_minutes":5,"long_break_minutes":15,"sessions_until_long_break":4,"auto_start_breaks":false,"auto_start_focus":false}';
const ws = '00000000-0000-4000-8000-000000090611';
const actor = '00000000-0000-4000-8000-000000090601';
const command = (revision, suffix) =>
  `select private.configure_time_tracker_control('${ws}','${actor}',${revision},'00000000-0000-4000-8000-${suffix}','${config}');`;

export function controlRaceScripts(
  expectedRevision,
  firstCommand,
  secondCommand
) {
  return {
    holder: `begin; set local statement_timeout='5s'; ${command(expectedRevision, firstCommand)}\n\\echo FIXTURE_READY\n`,
    competitor: `\\set VERBOSITY verbose\nset application_name='ttr-control-competitor'; set statement_timeout='5s';\n\\echo FIXTURE_READY\n${command(expectedRevision, secondCommand)}`,
  };
}

/** Keep one psql transaction open until the competing connection really waits. */
export function openFixtureSession(child, timeoutMs = 8000) {
  let output = '',
    errors = '',
    markerResolve,
    markerReject;
  const marker = new Promise((resolve, reject) => {
    markerResolve = resolve;
    markerReject = reject;
  });
  marker.catch(() => {});
  let terminate,
    ended = false;
  const done = new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(
      () => fail('Control fixture session timed out'),
      timeoutMs
    );
    function fail(message) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      markerReject(new Error(message));
      reject(new Error(message));
      child.kill('SIGTERM');
      terminate = setTimeout(() => child.kill('SIGKILL'), 1000);
    }
    child.stdout.on('data', (data) => {
      output += data;
      if (output.length > 65536)
        return fail('Control fixture output exceeded limit');
      if (output.includes('FIXTURE_READY')) markerResolve();
    });
    child.stderr.on('data', (data) => {
      errors += data;
      if (errors.length > 65536) fail('Control fixture error exceeded limit');
    });
    child.on('error', () => fail('Control fixture session failed to start'));
    child.stdin.on('error', () => fail('Control fixture input failed'));
    child.on('close', (code) => {
      clearTimeout(timer);
      clearTimeout(terminate);
      if (!output.includes('FIXTURE_READY'))
        markerReject(new Error('Control fixture readiness missing'));
      if (!finished) {
        finished = true;
        resolve({ code, output, errors });
      }
    });
  });
  done.catch(() => {});
  return {
    marker,
    done,
    write: (text) => child.stdin.write(text),
    end: (text) => {
      if (!ended) {
        ended = true;
        child.stdin.end(text);
      }
    },
  };
}

export async function runTimeTrackerControlConcurrency(metadata) {
  const admitted = await readLifecycleMetadata(metadata.disposableRoot);
  const identity = deriveIsolatedIdentity({
    headSha: metadata.headSha,
    repositoryPath: metadata.repositoryRoot,
  });
  assert.equal(admitted.projectId, identity.projectId);
  assert.equal(admitted.headSha, metadata.headSha);
  assert.equal(admitted.status, 'testing');
  const container = `supabase_db_${admitted.projectId}`;
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
  const execute = (sql) =>
    execFileSync('docker', args, {
      input: sql,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 65536,
    });
  execute(`insert into auth.users(id) values('${actor}');
    insert into public.users(id) values('${actor}') on conflict do nothing;
    insert into public.workspaces(id,name,personal,creator_id) values('${ws}','Synthetic control race',false,'${actor}');
    insert into public.workspace_members(ws_id,user_id,type) values('${ws}','${actor}','MEMBER') on conflict do nothing;
    ${command(0, '000000090631')}`);
  async function contend(
    expectedRevision,
    firstCommand,
    secondCommand,
    expectReplay
  ) {
    const first = openFixtureSession(
      spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    );
    let second;
    try {
      const scripts = controlRaceScripts(
        expectedRevision,
        firstCommand,
        secondCommand
      );
      first.write(scripts.holder);
      await first.marker;
      second = openFixtureSession(
        spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
      );
      second.end(scripts.competitor);
      await second.marker;
      // Bounded SQL lock observation is the causal race receipt, not a sleep.
      first.end(`do $wait$ declare deadline timestamptz:=clock_timestamp()+interval '3 seconds'; begin
        loop exit when exists(select 1 from pg_stat_activity where application_name='ttr-control-competitor' and wait_event_type='Lock');
          if clock_timestamp()>deadline then raise exception 'Competitor did not wait'; end if;
          perform pg_sleep(0.01);
        end loop;
        end $wait$; commit;`);
      const [a, b] = await Promise.all([first.done, second.done]);
      assert.equal(a.code, 0, 'Holding transaction must commit');
      if (expectReplay)
        assert.equal(b.code, 0, 'Same command must replay once');
      else {
        assert.notEqual(b.code, 0);
        assert.match(b.errors, /40001:.*Control revision conflict/u);
      }
    } finally {
      first.end('rollback;');
      if (second) await Promise.allSettled([first.done, second.done]);
      else await Promise.allSettled([first.done]);
    }
  }
  await contend(1, '000000090632', '000000090633', false);
  assert.equal(
    execute(
      `select revision from private.time_tracker_controls where ws_id='${ws}' and actor_id='${actor}';`
    ).trim(),
    '2'
  );
  await contend(2, '000000090634', '000000090634', true);
  assert.equal(
    execute(
      `select revision from private.time_tracker_controls where ws_id='${ws}' and actor_id='${actor}';`
    ).trim(),
    '3'
  );
  execute(
    `delete from public.workspaces where id='${ws}'; delete from auth.users where id='${actor}';`
  );
  console.log('Actual two-connection control CAS and idempotency passed');
}
