import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  deriveIsolatedIdentity,
  readLifecycleMetadata,
} from './run-supabase-isolated.js';
import { openFixtureSession } from './time-tracker-control-concurrency.mjs';

const actor = '00000000-0000-4000-8000-000000098101';
const ws = '00000000-0000-4000-8000-000000098111';
const subject = '00000000-0000-4000-8000-000000098121';
const group = '00000000-0000-4000-8000-000000098131';
const report = '00000000-0000-4000-8000-000000098141';
const recipient = 'synthetic@example.invalid';
const application = 'ttr-periodic-proof-competitor';
const marker = '\n\\echo FIXTURE_READY\n';

export function periodicRaceScripts(holder, competitor) {
  return {
    holder: `begin; set local statement_timeout='5s'; ${holder}${marker}`,
    competitor: `set application_name='${application}'; set statement_timeout='5s';${marker}${competitor}`,
    release: `do $wait$ declare deadline timestamptz:=clock_timestamp()+interval '3 seconds'; begin
      loop exit when exists(select 1 from pg_stat_activity where application_name='${application}' and wait_event_type='Lock');
        if clock_timestamp()>deadline then raise exception 'Periodic competitor did not wait'; end if;
        perform pg_sleep(0.01);
      end loop; end $wait$; commit;`,
  };
}

export async function withFixtureCleanup(body, cleanup) {
  let result, primaryFailure;
  let failed = false;
  try {
    result = await body();
  } catch (error) {
    failed = true;
    primaryFailure = error;
  }
  try {
    await cleanup();
  } catch (cleanupFailure) {
    if (failed)
      throw new AggregateError(
        [primaryFailure, cleanupFailure],
        'Periodic fixture and cleanup both failed'
      );
    throw cleanupFailure;
  }
  if (failed) throw primaryFailure;
  return result;
}

export async function runPeriodicReportDeliveryConcurrency(metadata) {
  const admitted = await readLifecycleMetadata(metadata.disposableRoot);
  const identity = deriveIsolatedIdentity({
    headSha: metadata.headSha,
    repositoryPath: metadata.repositoryRoot,
  });
  assert.equal(admitted.projectId, identity.projectId);
  assert.equal(admitted.headSha, metadata.headSha);
  assert.equal(admitted.repositoryRoot, metadata.repositoryRoot);
  assert.equal(admitted.status, 'testing');
  const args = [
    'exec',
    '-i',
    `supabase_db_${admitted.projectId}`,
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
  const execute = (input) =>
    execFileSync('docker', args, {
      input,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 65536,
    }).trim();
  const request = (action) =>
    `select private.request_periodic_report_delivery('${report}','${ws}','${action}',true)->>'code';`;
  const state = () =>
    JSON.parse(
      execute(
        `select jsonb_build_object('queue',to_jsonb(q),'report',to_jsonb(r)) from private.user_report_email_queue q join private.external_user_monthly_reports r on r.id=q.report_id where r.id='${report}';`
      )
    );
  const claim = (worker) =>
    `select count(*) from private.claim_periodic_report_emails('${worker}',1);`;
  const finish = (queue, worker, lease, status, sent = false) =>
    `select private.finish_periodic_report_email('${queue}','${worker}','${lease}','${status}','${recipient}'${sent ? ',p_sent_at=>now()' : ''});`;
  async function contend(holder, competitor) {
    const a = openFixtureSession(
      spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    );
    let b;
    try {
      const scripts = periodicRaceScripts(holder, competitor);
      a.write(scripts.holder);
      await a.marker;
      b = openFixtureSession(
        spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
      );
      b.end(scripts.competitor);
      await b.marker;
      a.end(scripts.release);
      const [held, result] = await Promise.all([a.done, b.done]);
      assert.equal(held.code, 0, held.errors);
      assert.equal(result.code, 0, result.errors);
      return result.output;
    } finally {
      a.end('rollback;');
      await Promise.allSettled(b ? [a.done, b.done] : [a.done]);
    }
  }
  assert.equal(
    execute(`select count(*) from public.users where id='${actor}';`),
    '0',
    'Synthetic actor must not preexist in admitted disposable database'
  );
  await withFixtureCleanup(
    async () => {
      execute(`insert into public.users(id) values('${actor}');
      insert into public.workspaces(id,name,personal,creator_id) values('${ws}','Synthetic periodic proof',false,'${actor}');
      insert into public.workspace_users(id,ws_id,full_name,email) values('${subject}','${ws}','Synthetic subject','${recipient}');
      insert into public.workspace_user_groups(id,ws_id,name) values('${group}','${ws}','Synthetic group');
      insert into private.external_user_monthly_reports(id,user_id,group_id,title,content,feedback,updated_at)
        values('${report}','${subject}','${group}','Synthetic','Observed','Human',now());
      update private.external_user_monthly_reports set report_approval_status='APPROVED',approved_by='${subject}',approved_at=now() where id='${report}';`);
      assert.equal(execute(request('send')), '200');
      // The second real connection must skip the row held by the first connection.
      const holder = openFixtureSession(
        spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
      );
      try {
        holder.write(
          `begin; select id from private.external_user_monthly_reports where id='${report}' for update;${marker}`
        );
        await holder.marker;
        assert.equal(execute(claim('skipped-worker')), '0');
        assert.equal(state().queue.attempt_count, 0);
        holder.end('commit;');
        assert.equal((await holder.done).code, 0);
      } finally {
        holder.end('rollback;');
        await Promise.allSettled([holder.done]);
      }
      assert.equal(execute(claim('first-worker')), '1');
      assert.equal(execute(claim('duplicate-worker')), '0');
      let snapshot = state();
      assert.equal(snapshot.queue.locked_by, 'first-worker');
      assert.equal(snapshot.queue.attempt_count, 1);
      assert.equal(snapshot.queue.status, 'processing');
      assert.equal(snapshot.report.delivery_status, 'processing');
      assert.equal(
        execute(
          finish(
            snapshot.queue.id,
            'first-worker',
            snapshot.queue.locked_at,
            'failed'
          )
        ),
        't'
      );
      assert.equal(execute(request('retry')), '200');
      const revoked = await contend(
        `select id from private.external_user_monthly_reports where id='${report}' for update;
      update private.external_user_monthly_reports set report_approval_status='PENDING',approved_by=null,approved_at=null where id='${report}';`,
        request('send')
      );
      assert.match(revoked, /^409$/mu);
      snapshot = state();
      assert.equal(snapshot.queue.status, 'cancelled');
      assert.equal(snapshot.queue.attempt_count, 1);
      assert.equal(snapshot.report.report_approval_status, 'PENDING');
      execute(
        `update private.external_user_monthly_reports set report_approval_status='APPROVED',approved_by='${subject}',approved_at=now() where id='${report}';`
      );
      assert.equal(execute(request('send')), '200');
      assert.equal(execute(claim('old-worker')), '1');
      snapshot = state();
      const stale = await contend(
        `select id from private.external_user_monthly_reports where id='${report}' for update;
      update private.user_report_email_queue set locked_by='successor-worker',locked_at=clock_timestamp()+interval '1 second' where id='${snapshot.queue.id}';`,
        finish(
          snapshot.queue.id,
          'old-worker',
          snapshot.queue.locked_at,
          'sent',
          true
        )
      );
      assert.match(stale, /^f$/mu);
      const successor = state();
      assert.equal(successor.queue.locked_by, 'successor-worker');
      assert.equal(successor.queue.status, 'processing');
      assert.equal(successor.report.delivery_status, 'processing');
      assert.equal(successor.queue.sent_at, null);
      assert.equal(
        execute(
          finish(
            successor.queue.id,
            'successor-worker',
            successor.queue.locked_at,
            'sent',
            true
          )
        ),
        't'
      );
      const completed = state();
      assert.equal(completed.queue.status, 'sent');
      assert.equal(completed.report.delivery_status, 'sent');
      assert.equal(
        execute(
          finish(
            snapshot.queue.id,
            'old-worker',
            snapshot.queue.locked_at,
            'failed'
          )
        ),
        'f'
      );
      assert.deepEqual(state(), completed);
    },
    () =>
      execute(`begin;
    delete from public.workspaces where creator_id='${actor}';
    delete from public.workspace_members where user_id='${actor}';
    delete from public.users where id='${actor}';
    commit;`)
  );
  console.log(
    'Actual periodic two-connection SKIP LOCKED, revocation/request and successor-lease completion controls passed; no provider dispatched'
  );
}
