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

async function fixtureCommands(metadata) {
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
  return { args, execute };
}

export async function runTimeTrackerControlConcurrency(metadata) {
  const { args, execute } = await fixtureCommands(metadata);
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

const replaceWs = '00000000-0000-4000-8000-000000090811';
const replaceActor = '00000000-0000-4000-8000-000000090801';
const replaceStatement = (revision, expectedId, suffix) =>
  `select private.replace_running_time_tracker_session('${replaceWs}','${replaceActor}',${revision},${expectedId ? `'${expectedId}'` : 'null'},'00000000-0000-4000-8000-${suffix}','Synthetic replacement',null,null,null);`;

export function replacementRaceScripts(holderSql, competitorSql) {
  return {
    holder: `begin; set local statement_timeout='5s'; ${holderSql}\n\\echo FIXTURE_READY\n`,
    competitor: `\\set VERBOSITY verbose\nset application_name='ttr-replace-competitor'; set statement_timeout='5s';\n\\echo FIXTURE_READY\n${competitorSql}`,
    release: `do $wait$ declare deadline timestamptz:=clock_timestamp()+interval '3 seconds'; begin
      loop exit when exists(select 1 from pg_stat_activity where application_name='ttr-replace-competitor' and wait_event_type='Lock');
        if clock_timestamp()>deadline then raise exception 'Competitor did not wait'; end if;
        perform pg_sleep(0.01);
      end loop;
      end $wait$; commit;`,
  };
}

const reviewer = '00000000-0000-4000-8000-000000090802';
const approvalRequest = '00000000-0000-4000-8000-000000090841';
export function normalizedApprovalScript(linked) {
  return `select pg_advisory_xact_lock(hashtextextended(concat_ws(':','time-tracker-control','${replaceWs}'::uuid,'${replaceActor}'::uuid),0));
    select 1 from private.time_tracker_controls where ws_id='${replaceWs}' and actor_id='${replaceActor}' for update;
    select 1 from private.time_tracker_operation_scopes where ws_id='${replaceWs}' and actor_id='${replaceActor}' for update;
    select 1 from private.time_tracking_requests where id='${approvalRequest}' for update;
    select 1 from public.time_tracking_sessions where id='${linked}' for update;
    select 1 from public.time_tracking_breaks where session_id='${linked}' order by id for update;
    select private.update_time_tracking_request('${approvalRequest}','approve','${replaceWs}','${reviewer}',null,null);`;
}

export async function runTimeTrackerReplacementConcurrency(metadata) {
  const { args, execute } = await fixtureCommands(metadata);
  execute(`insert into auth.users(id) values('${replaceActor}');
    insert into public.users(id) values('${replaceActor}') on conflict do nothing;
    insert into public.workspaces(id,name,personal,creator_id) values('${replaceWs}','Synthetic replacement race',false,'${replaceActor}');
    insert into public.workspace_members(ws_id,user_id,type) values('${replaceWs}','${replaceActor}','MEMBER') on conflict do nothing;
    select private.configure_time_tracker_control('${replaceWs}','${replaceActor}',0,'00000000-0000-4000-8000-000000090831','${config}');`);
  const currentId = () =>
    execute(
      `select id from public.time_tracking_sessions where ws_id='${replaceWs}' and user_id='${replaceActor}' and is_running;`
    ).trim();
  const counts = (revision, receipts) => {
    assert.equal(
      execute(
        `select revision from private.time_tracker_operation_scopes where ws_id='${replaceWs}' and actor_id='${replaceActor}';`
      ).trim(),
      String(revision)
    );
    assert.equal(
      execute(
        `select count(*) from private.time_tracker_operation_receipts where ws_id='${replaceWs}';`
      ).trim(),
      String(receipts)
    );
    assert.equal(
      execute(
        `select count(*) from public.time_tracking_sessions where ws_id='${replaceWs}' and is_running;`
      ).trim(),
      '1'
    );
  };
  async function contend(holder, competitor, conflict = false) {
    const scripts = replacementRaceScripts(holder, competitor);
    const first = openFixtureSession(
      spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    );
    let second;
    try {
      first.write(scripts.holder);
      await first.marker;
      second = openFixtureSession(
        spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
      );
      second.end(scripts.competitor);
      await second.marker;
      first.end(scripts.release);
      const [a, b] = await Promise.all([first.done, second.done]);
      assert.equal(a.code, 0, 'Replacement holder commits');
      if (conflict) {
        assert.notEqual(b.code, 0);
        assert.match(b.errors, /40001:.*Timer revision conflict/u);
      } else assert.equal(b.code, 0, 'Replay or ordered peer commits');
    } finally {
      first.end('rollback;');
      await Promise.allSettled(
        second ? [first.done, second.done] : [first.done]
      );
    }
  }
  try {
    await contend(
      replaceStatement(0, null, '000000090832'),
      replaceStatement(0, null, '000000090833'),
      true
    );
    counts(1, 1);
    const prior = currentId();
    const replay = replaceStatement(1, prior, '000000090834');
    await contend(replay, replay);
    counts(2, 2);
    const next = currentId();
    await contend(
      `select private.configure_time_tracker_control('${replaceWs}','${replaceActor}',1,'00000000-0000-4000-8000-000000090835','${config}');`,
      replaceStatement(2, next, '000000090836')
    );
    counts(3, 3);
    assert.equal(
      execute(
        `select revision from private.time_tracker_controls where ws_id='${replaceWs}' and actor_id='${replaceActor}';`
      ).trim(),
      '2'
    );
    // Invoke the actual authorized approval RPC while normalized locks remain held.
    const linked = currentId();
    execute(`insert into auth.users(id) values('${reviewer}');
      insert into public.users(id) values('${reviewer}') on conflict do nothing;
      insert into public.workspace_members(ws_id,user_id,type) values('${replaceWs}','${reviewer}','MEMBER');
      insert into public.workspace_roles(id,ws_id,name) values('00000000-0000-4000-8000-000000090871','${replaceWs}','Synthetic reviewer');
      insert into public.workspace_role_members(role_id,user_id) values('00000000-0000-4000-8000-000000090871','${reviewer}');
      insert into public.workspace_role_permissions(ws_id,role_id,permission,enabled) values('${replaceWs}','00000000-0000-4000-8000-000000090871','manage_time_tracking_requests',true);
      insert into public.notification_preferences(ws_id,user_id,event_type,channel,enabled,scope)
        values('${replaceWs}','${replaceActor}','time_tracking_request_approved','web',true,'workspace'),
        ('${replaceWs}','${replaceActor}','time_tracking_request_approved','email',false,'workspace'),
        ('${replaceWs}','${replaceActor}','time_tracking_request_approved','push',false,'workspace') on conflict do nothing;
      update public.notification_preferences set enabled=(channel='web') where ws_id='${replaceWs}' and user_id='${replaceActor}' and event_type='time_tracking_request_approved';
      insert into private.time_tracking_requests(id,workspace_id,user_id,title,start_time,end_time,linked_session_id)
        values('${approvalRequest}','${replaceWs}','${replaceActor}','Synthetic approval lock',now()-interval '1 minute',now(),'${linked}');`);
    await contend(
      normalizedApprovalScript(linked),
      replaceStatement(3, linked, '000000090837')
    );
    assert.equal(
      execute(
        `select approval_status from private.time_tracking_requests where id='${approvalRequest}';`
      ).trim(),
      'APPROVED'
    );
    assert.equal(
      execute(
        `select approved_by from private.time_tracking_requests where id='${approvalRequest}';`
      ).trim(),
      reviewer
    );
    assert.equal(
      execute(
        `select linked_session_id from private.time_tracking_requests where id='${approvalRequest}';`
      ).trim(),
      linked
    );
    assert.equal(
      execute(
        `select count(*) from private.time_tracking_request_activity where request_id='${approvalRequest}' and action_type='STATUS_CHANGED' and actor_id='${reviewer}' and new_status='APPROVED';`
      ).trim(),
      '1'
    );
    assert.equal(
      execute(
        `select count(*) from public.notifications where entity_id='${approvalRequest}' and type='time_tracking_request_approved' and user_id='${replaceActor}' and created_by='${reviewer}';`
      ).trim(),
      '1'
    );
    counts(4, 4);
    assert.equal(
      execute(
        `select count(*) from public.time_tracking_sessions where ws_id='${replaceWs}';`
      ).trim(),
      '4'
    );
  } finally {
    execute(
      `delete from public.workspaces where id='${replaceWs}'; delete from auth.users where id in('${replaceActor}','${reviewer}');`
    );
  }
  console.log(
    'Actual OFF replacement CAS, replay and shared scope contention passed'
  );
}
