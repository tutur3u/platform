import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  deriveIsolatedIdentity,
  readLifecycleMetadata,
} from './run-supabase-isolated.js';
import { openFixtureSession } from './time-tracker-control-concurrency.mjs';

const actor = '00000000-0000-4000-8000-000000098001';
const ws = '00000000-0000-4000-8000-000000098011';
const subject = '00000000-0000-4000-8000-000000098021';
const group = '00000000-0000-4000-8000-000000098031';
const report = '00000000-0000-4000-8000-000000098041';
export function reviewRaceScripts({ readOnly = false } = {}) {
  return {
    holder: `begin; set local statement_timeout='5s';
      update private.external_user_monthly_reports set title='Holder ${readOnly}' where id='${report}';
      \n\\echo FIXTURE_READY\n`,
    competitor: `\\set VERBOSITY verbose\nset application_name='ttr-review-competitor'; set statement_timeout='5s';
      \n\\echo FIXTURE_READY\n${
        readOnly
          ? `begin; select review_revision from private.external_user_monthly_reports where id='${report}' for update; commit;`
          : `update private.external_user_monthly_reports set title='Competitor',review_revision=999 where id='${report}';`
      }`,
  };
}
export async function runReportReviewConcurrency(metadata) {
  const admitted = await readLifecycleMetadata(metadata.disposableRoot);
  const identity = deriveIsolatedIdentity({
    headSha: metadata.headSha,
    repositoryPath: metadata.repositoryRoot,
  });
  assert.equal(admitted.projectId, identity.projectId);
  assert.equal(admitted.headSha, metadata.headSha);
  assert.equal(admitted.repositoryRoot, metadata.repositoryRoot);
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
  const execute = (input) =>
    execFileSync('docker', args, {
      input,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 65536,
    });
  execute(`insert into auth.users(id) values('${actor}');
    insert into public.users(id) values('${actor}') on conflict do nothing;
    insert into public.workspaces(id,name,personal,creator_id) values('${ws}','Synthetic review race',false,'${actor}');
    insert into public.workspace_users(id,ws_id,full_name) values('${subject}','${ws}','Synthetic subject');
    insert into public.workspace_user_groups(id,ws_id,name) values('${group}','${ws}','Synthetic group');
    insert into private.external_user_monthly_reports(id,user_id,group_id,title,content,feedback,updated_at)
      values('${report}','${subject}','${group}','Initial','Observed','Next step',now());`);
  async function contend(readOnly) {
    const first = openFixtureSession(
      spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    );
    let second;
    try {
      const scripts = reviewRaceScripts({ readOnly });
      first.write(scripts.holder);
      await first.marker;
      second = openFixtureSession(
        spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
      );
      second.end(scripts.competitor);
      await second.marker;
      // Actual bounded database lock observation, not a timing assumption.
      first.end(`do $wait$ declare deadline timestamptz:=clock_timestamp()+interval '3 seconds'; begin
        loop exit when exists(select 1 from pg_stat_activity where application_name='ttr-review-competitor' and wait_event_type='Lock');
          if clock_timestamp()>deadline then raise exception 'Review competitor did not wait'; end if;
          perform pg_sleep(0.01);
        end loop;
      end $wait$; commit;`);
      const [a, b] = await Promise.all([first.done, second.done]);
      assert.equal(a.code, 0, 'Holding edit must commit');
      assert.equal(
        b.code,
        0,
        'Competing operation must complete after observed wait'
      );
      if (readOnly)
        assert.match(
          b.output,
          /^4$/mu,
          'Locked read sees committed current version'
        );
    } finally {
      first.end('rollback;');
      await Promise.allSettled(
        second ? [first.done, second.done] : [first.done]
      );
    }
  }
  try {
    await contend(false);
    assert.equal(
      execute(
        `select review_revision from private.external_user_monthly_reports where id='${report}';`
      ).trim(),
      '3',
      'Two edits increment twice without caller-forged version'
    );
    await contend(true);
    assert.equal(
      execute(
        `select review_revision from private.external_user_monthly_reports where id='${report}';`
      ).trim(),
      '4'
    );
  } finally {
    execute(
      `delete from public.workspaces where id='${ws}'; delete from auth.users where id='${actor}';`
    );
  }
  console.log(
    'Actual two-connection review version serialization and locked current read passed; no canonical approval RPC tested'
  );
}
