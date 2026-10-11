import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  deriveIsolatedIdentity,
  readLifecycleMetadata,
} from './run-supabase-isolated.js';
import { openFixtureSession } from './time-tracker-control-concurrency.mjs';

const ws = '00000000-0000-4000-8000-000000096611';
const actor = '00000000-0000-4000-8000-000000096601';
const teacher = '00000000-0000-4000-8000-000000096621';
const group = '00000000-0000-4000-8000-000000096631';
const literal = (value) => (value === null ? 'null' : `'${value}'`);
export const defaultWrite = (revision) =>
  `select private.save_tutoring_hours_default('${ws}','${actor}',${literal(revision)},'UTC',true,'{}');`;
export const overrideWrite = (base, revision, reset = false) =>
  `select private.save_tutoring_hours_override('${ws}','${actor}','${teacher}',${literal(base)},${literal(revision)},'{}',${reset});`;
export function hoursRaceScripts(holder, competitor) {
  return {
    holder: `begin; set local statement_timeout='5s'; ${holder}\n\\echo FIXTURE_READY\n`,
    competitor: `\\set VERBOSITY verbose\nset application_name='ttr-hours-competitor'; set statement_timeout='5s';\n\\echo FIXTURE_READY\n${competitor}`,
  };
}

/** CI-only actual two-connection test; exact disposable identity is admission. */
export async function runTutoringTeacherHoursConcurrency(metadata) {
  const admitted = await readLifecycleMetadata(metadata.disposableRoot);
  const identity = deriveIsolatedIdentity({
    headSha: metadata.headSha,
    repositoryPath: metadata.repositoryRoot,
  });
  assert.equal(admitted.projectId, identity.projectId);
  assert.equal(admitted.headSha, metadata.headSha);
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
  const execute = (sql) =>
    execFileSync('docker', args, {
      input: sql,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 65536,
    });
  execute(`insert into auth.users(id) values('${actor}');
    insert into public.users(id) values('${actor}') on conflict do nothing;
    insert into public.workspaces(id,name,personal,creator_id) values('${ws}','Synthetic hours race',false,'${actor}');
    insert into public.workspace_members(ws_id,user_id,type) values('${ws}','${actor}','MEMBER') on conflict do nothing;
    insert into public.workspace_users(id,ws_id,full_name) values('${teacher}','${ws}','Synthetic teacher');
    insert into public.workspace_user_groups(id,ws_id,name) values('${group}','${ws}','Synthetic teacher group');
    insert into public.workspace_user_groups_users(user_id,group_id,role) values('${teacher}','${group}','TEACHER');`);
  async function contend(holder, competitor) {
    const first = openFixtureSession(
      spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    );
    let second;
    try {
      const scripts = hoursRaceScripts(holder, competitor);
      first.write(scripts.holder);
      await first.marker;
      second = openFixtureSession(
        spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
      );
      second.end(scripts.competitor);
      await second.marker;
      // Observe real lock waiting before release; bounded CI assertion, not blind sleep.
      first.end(`do $wait$ declare deadline timestamptz:=clock_timestamp()+interval '3 seconds'; begin
        loop exit when exists(select 1 from pg_stat_activity where application_name='ttr-hours-competitor' and wait_event_type='Lock');
          if clock_timestamp()>deadline then raise exception 'Competitor did not wait'; end if;
          perform pg_sleep(0.01);
        end loop;
        end $wait$; commit;`);
      const [a, b] = await Promise.all([first.done, second.done]);
      assert.equal(a.code, 0, 'Holding transaction must commit');
      assert.notEqual(b.code, 0, 'Stale competitor must conflict');
      assert.match(b.errors, /40001:.*Tutoring hours revision conflict/u);
    } finally {
      first.end('rollback;');
      await Promise.allSettled(
        second ? [first.done, second.done] : [first.done]
      );
    }
  }
  try {
    await contend(defaultWrite(null), defaultWrite(null));
    assert.equal(
      execute(
        `select revision::text from private.workspace_tutoring_hours_defaults where ws_id='${ws}';`
      ).trim(),
      '1'
    );
    await contend(defaultWrite('1'), overrideWrite('1', null));
    assert.equal(
      execute(
        `select count(*) from private.workspace_tutoring_hours_overrides where ws_id='${ws}';`
      ).trim(),
      '0'
    );
    execute(overrideWrite('2', null));
    await contend(overrideWrite('2', '1', true), overrideWrite('2', '1'));
    assert.equal(
      execute(
        `select revision::text||':'||week::text from private.workspace_tutoring_hours_overrides where ws_id='${ws}' and teacher_id='${teacher}';`
      ).trim(),
      '2:{}'
    );
    console.log(
      'Actual two-connection hours absent-create/default-change/save-reset CAS passed'
    );
  } finally {
    execute(
      `delete from public.workspaces where id='${ws}'; delete from auth.users where id='${actor}';`
    );
  }
}
