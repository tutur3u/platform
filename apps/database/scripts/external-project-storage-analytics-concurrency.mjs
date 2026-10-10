import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  deriveIsolatedIdentity,
  readLifecycleMetadata,
} from './run-supabase-isolated.js';
import { openFixtureSession } from './time-tracker-control-concurrency.mjs';

export const storageRaceWorkspace = '00000000-0000-4000-8000-000000073071';
const actor = '00000000-0000-4000-8000-000000073070';
const prefix = `${storageRaceWorkspace}/external-projects/exocorpse/`;
const refresh = `select public.get_external_project_storage_analytics('${storageRaceWorkspace}','exocorpse');`;
const bounds =
  "set statement_timeout='5s'; set lock_timeout='4s'; set idle_in_transaction_session_timeout='6s';";

export function storageAnalyticsRaceScripts(operation) {
  if (!['insert', 'update'].includes(operation))
    throw new Error('Unsupported storage race operation');
  const mutation =
    operation === 'insert'
      ? `insert into storage.objects(bucket_id,name,metadata) values('workspaces','${prefix}new.png','{"size":50}');`
      : `update storage.objects set metadata='{"size":300}' where bucket_id='workspaces' and name='${prefix}original.png';`;
  return {
    holder: `begin; ${bounds} set application_name='storage-cache-holder'; select set_config('request.jwt.claims','{"role":"service_role"}',true); ${refresh}\n\\echo FIXTURE_READY\n`,
    competitor: `\\set VERBOSITY verbose\n${bounds} set application_name='storage-cache-competitor';\n\\echo FIXTURE_READY\n${mutation}`,
    release: `do $wait$ declare deadline timestamptz:=clock_timestamp()+interval '3 seconds'; begin
      loop exit when exists(
        select 1 from pg_stat_activity a join pg_locks l on l.pid=a.pid
        where a.application_name='storage-cache-competitor' and a.pid<>pg_backend_pid()
          and a.wait_event_type='Lock' and l.locktype='advisory' and not l.granted
          and l.classid=((hashtextextended('${storageRaceWorkspace}',73007)>>32)&4294967295)::oid
          and l.objid=(hashtextextended('${storageRaceWorkspace}',73007)&4294967295)::oid and l.objsubid=1
          and pg_backend_pid()=any(pg_blocking_pids(a.pid)));
        if clock_timestamp()>deadline then raise exception 'Storage mutation did not wait on refresh advisory lock'; end if;
        perform pg_sleep(0.01);
      end loop; end $wait$; commit;`,
  };
}

export function parseStorageRaceScalar(output) {
  const rows = output.trim().split('\n');
  if (rows.length !== 1 || !/^\d+$/u.test(rows[0]))
    throw new Error(
      'Storage race scalar requires exactly one unsigned integer data row'
    );
  return rows[0];
}

export function createStorageRaceExecutor(projectId, run = execFileSync) {
  if (!/^[a-zA-Z0-9_-]+$/u.test(projectId))
    throw new Error('Invalid owned project identity');
  const args = [
    'exec',
    '-i',
    `supabase_db_${projectId}`,
    'psql',
    '-X',
    '-q',
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
    run('docker', args, {
      input: `${bounds} ${sql}`,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 65536,
    }).trim();
  return {
    args,
    execute,
    scalar: (sql) => parseStorageRaceScalar(execute(sql)),
  };
}

export async function runStorageAnalyticsConcurrency(metadata) {
  const admitted = await readLifecycleMetadata(metadata.disposableRoot);
  const identity = deriveIsolatedIdentity({
    headSha: metadata.headSha,
    repositoryPath: metadata.repositoryRoot,
  });
  assert.equal(admitted.projectId, identity.projectId);
  assert.equal(admitted.headSha, metadata.headSha);
  assert.equal(admitted.status, 'testing');
  const { args, execute, scalar } = createStorageRaceExecutor(
    admitted.projectId
  );
  const cache = `private.external_project_storage_analytics_cache where ws_id='${storageRaceWorkspace}' and adapter='exocorpse'`;
  let primaryError;
  let seedStarted = false;
  try {
    assert.equal(
      scalar(`select count(*) from auth.users where id='${actor}';`),
      '0',
      'Synthetic actor must be unused'
    );
    assert.equal(
      scalar(`select count(*) from public.users where id='${actor}';`),
      '0',
      'Synthetic public actor must be unused'
    );
    assert.equal(
      scalar(
        `select count(*) from public.workspaces where id='${storageRaceWorkspace}';`
      ),
      '0',
      'Synthetic workspace must be unused'
    );
    assert.equal(
      scalar(
        `select count(*) from storage.objects where bucket_id='workspaces' and name in('${prefix}original.png','${prefix}new.png');`
      ),
      '0',
      'Synthetic storage paths must be unused'
    );
    seedStarted = true;
    execute(`insert into auth.users(id) values('${actor}');
      insert into public.users(id) values('${actor}') on conflict do nothing;
      insert into public.workspaces(id,name,personal,creator_id) values('${storageRaceWorkspace}','Synthetic storage cache race',false,'${actor}');
      insert into storage.buckets(id,name) values('workspaces','workspaces') on conflict do nothing;
      insert into storage.objects(bucket_id,name,metadata) values('workspaces','${prefix}original.png','{"size":100}');`);
    for (const [operation, expectedSize, expectedBefore] of [
      ['insert', '150', '100'],
      ['update', '350', '150'],
    ]) {
      execute(`delete from ${cache};`);
      assert.equal(
        scalar(`select count(*) from ${cache};`),
        '0',
        'Race must begin with no cache row'
      );
      const scripts = storageAnalyticsRaceScripts(operation);
      const first = openFixtureSession(
        spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] }),
        8000
      );
      let second;
      try {
        first.write(scripts.holder);
        await first.marker;
        second = openFixtureSession(
          spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] }),
          8000
        );
        second.end(scripts.competitor);
        await second.marker;
        first.end(scripts.release);
        const [a, b] = await Promise.all([first.done, second.done]);
        assert.equal(
          a.code,
          0,
          'Actual refresh holder must commit after lock observation'
        );
        assert.equal(
          b.code,
          0,
          'Actual storage mutation must complete after holder commits'
        );
        const payloadLine = a.output
          .split('\n')
          .find((line) => line.startsWith('{') && line.includes('"totalSize"'));
        assert.equal(
          String(JSON.parse(payloadLine).totalSize),
          expectedBefore,
          'Holder computed the pre-mutation snapshot'
        );
      } finally {
        first.end('rollback;');
        await Promise.allSettled(
          second ? [first.done, second.done] : [first.done]
        );
      }
      assert.equal(
        scalar(
          `select count(*) from ${cache} and payload is null and computed_at is null;`
        ),
        '1',
        'Contending mutation invalidated the newly committed first cache row'
      );
      const result = scalar(
        `set request.jwt.claims='{"role":"service_role"}'; select public.get_external_project_storage_analytics('${storageRaceWorkspace}','exocorpse')->>'totalSize';`
      );
      assert.equal(
        result,
        expectedSize,
        'Recalculation must include committed insertion/update'
      );
      assert.equal(
        scalar(`select payload->>'totalSize' from ${cache};`),
        expectedSize,
        'Persisted snapshot equals recalculated total'
      );
      assert.equal(scalar(`select payload->>'fileCount' from ${cache};`), '2');
    }
  } catch (error) {
    primaryError = error;
  }
  try {
    if (seedStarted)
      execute(`select set_config('storage.allow_delete_query','true',false);
      delete from storage.objects where bucket_id='workspaces' and name in('${prefix}original.png','${prefix}new.png');
      delete from public.workspaces where id='${storageRaceWorkspace}';
      delete from auth.users where id='${actor}';`);
  } catch (cleanupError) {
    if (primaryError)
      throw new AggregateError(
        [primaryError, cleanupError],
        'Storage race and owned fixture cleanup failed'
      );
    throw cleanupError;
  }
  if (primaryError) throw primaryError;
  console.log(
    'Actual distinct-session first-cache-row refresh vs insert/update advisory contention passed'
  );
}
