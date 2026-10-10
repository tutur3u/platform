import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  deriveIsolatedIdentity,
  readLifecycleMetadata,
} from './run-supabase-isolated.js';
import { openFixtureSession } from './time-tracker-control-concurrency.mjs';

export const absenceFixtureId = (n) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const id = absenceFixtureId;
const ws = id(92811),
  actor = id(92801),
  group = id(92831),
  student = id(92821),
  teacher = id(92822);
export function absenceCreateCommand(source, command) {
  const input = JSON.stringify({
    action: 'CREATE',
    groupId: group,
    studentUserId: student,
    slots: [
      {
        sourceAttendanceId: id(source),
        teacherUserId: teacher,
        sessionDate: '2030-01-10',
        startTime: '14:00',
        durationMinutes: 45,
      },
    ],
  });
  return `select private.manage_tutoring_absence_credit('${ws}','${actor}','${id(command)}','${input}');`;
}
export function absenceRaceScripts(holderCommand, competitorCommand) {
  return {
    holder: `begin; set local statement_timeout='6s'; ${holderCommand}\n\\echo FIXTURE_READY\n`,
    competitor: `\\set VERBOSITY verbose\nset application_name='tutoring-absence-competitor'; set statement_timeout='6s';\n\\echo FIXTURE_READY\n${competitorCommand}`,
    release: `do $wait$ declare deadline timestamptz:=clock_timestamp()+interval '3 seconds'; begin
      loop exit when exists(select 1 from pg_stat_activity where application_name='tutoring-absence-competitor' and wait_event_type='Lock');
        if clock_timestamp()>deadline then raise exception 'Absence competitor did not wait'; end if;
        perform pg_sleep(0.01);
      end loop;
      end $wait$; commit;`,
  };
}
export function absenceSeedSql() {
  return `insert into auth.users(id) values('${actor}');
    insert into public.users(id) values('${actor}') on conflict do nothing;
    insert into public.workspaces(id,name,personal,creator_id) values('${ws}','Synthetic absence race',false,'${actor}');
    insert into public.workspace_members(ws_id,user_id,type) values('${ws}','${actor}','MEMBER') on conflict do nothing;
    insert into public.workspace_users(id,ws_id,full_name) values('${student}','${ws}','Synthetic learner'),('${teacher}','${ws}','Synthetic teacher');
    insert into public.workspace_user_groups(id,ws_id,name) values('${group}','${ws}','Synthetic class');
    insert into public.workspace_user_groups_users(group_id,user_id,role) values('${group}','${student}','STUDENT'),('${group}','${teacher}','TEACHER');
    insert into public.user_group_attendance(id,group_id,user_id,date,status) values
      ('${id(92851)}','${group}','${student}','2030-01-01','ABSENT'),
      ('${id(92852)}','${group}','${student}','2030-01-02','ABSENT'),
      ('${id(92853)}','${group}','${student}','2030-01-03','ABSENT'),
      ('${id(92854)}','${group}','${student}','2030-01-04','ABSENT');`;
}
export async function runTutoringAbsenceConcurrency(metadata) {
  const admitted = await readLifecycleMetadata(metadata.disposableRoot);
  const expected = deriveIsolatedIdentity({
    headSha: metadata.headSha,
    repositoryPath: metadata.repositoryRoot,
  });
  assert.equal(admitted.projectId, expected.projectId);
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
  async function contend(holderSql, competitorSql, expectedFailure) {
    const a = openFixtureSession(
      spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] }),
      10000
    );
    let b;
    try {
      const scripts = absenceRaceScripts(holderSql, competitorSql);
      a.write(scripts.holder);
      await a.marker;
      b = openFixtureSession(
        spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] }),
        10000
      );
      b.end(scripts.competitor);
      await b.marker;
      a.end(scripts.release);
      const [first, second] = await Promise.all([a.done, b.done]);
      assert.equal(first.code, 0, 'Holding transaction must commit');
      if (expectedFailure) {
        assert.notEqual(
          second.code,
          0,
          'Competitor must reject conflicting state'
        );
        assert.match(second.errors, expectedFailure);
      } else
        assert.equal(
          second.code,
          0,
          'Authorized replay/transition must complete'
        );
    } finally {
      a.end('rollback;');
      if (b) await Promise.allSettled([a.done, b.done]);
      else await Promise.allSettled([a.done]);
    }
  }
  try {
    execute(absenceSeedSql());
    await contend(
      absenceCreateCommand(92851, 92871),
      absenceCreateCommand(92851, 92872),
      /40001:.*Source absence already credited/u
    );
    assert.equal(
      execute(
        `select count(*) from private.tutoring_absence_credits where original_attendance_id='${id(92851)}';`
      ).trim(),
      '1'
    );
    await contend(
      absenceCreateCommand(92852, 92873),
      absenceCreateCommand(92852, 92873)
    );
    assert.equal(
      execute(
        `select count(*) from private.tutoring_absence_credits where original_attendance_id='${id(92852)}';`
      ).trim(),
      '1'
    );
    await contend(
      `update public.user_group_attendance set status='PRESENT' where id='${id(92853)}';`,
      absenceCreateCommand(92853, 92874),
      /22023:.*Source absence unavailable/u
    );
    assert.equal(
      execute(
        `select count(*) from private.tutoring_absence_credits where original_attendance_id='${id(92853)}';`
      ).trim(),
      '0'
    );
    // UPDATE starts before the CREATE commits: after waiting on attendance row,
    // trigger must see the newly committed RESERVED claim (statement snapshot race).
    await contend(
      absenceCreateCommand(92854, 92875),
      `update public.user_group_attendance set status='PRESENT' where id='${id(92854)}';`,
      /40001:.*Source absence requires explicit credit resolution/u
    );
    assert.equal(
      execute(
        `select status from public.user_group_attendance where id='${id(92854)}';`
      ).trim(),
      'ABSENT'
    );
    assert.equal(
      execute(
        'select count(*) from private.tutoring_absence_write_permits;'
      ).trim(),
      '0'
    );
    assert.equal(
      execute(
        `select count(*) from private.workspace_tutoring_sessions where ws_id='${ws}';`
      ).trim(),
      '3'
    );
    console.log(
      'Actual two-connection absence uniqueness, replay and correction races passed'
    );
  } finally {
    execute(
      `delete from public.workspaces where id='${ws}'; delete from auth.users where id='${actor}';`
    );
  }
}
