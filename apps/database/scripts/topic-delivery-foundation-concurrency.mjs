import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  deriveIsolatedIdentity,
  readLifecycleMetadata,
} from './run-supabase-isolated.js';
import { openFixtureSession } from './time-tracker-control-concurrency.mjs';

const fid = (suffix) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const actor = fid(122701),
  ws = fid(122711),
  parent = fid(122721);
const attempt = fid(122731),
  second = fid(122732);
export const deliveryAttemptInsert = (
  id
) => `insert into private.topic_announcement_delivery_attempts(id,announcement_id,ws_id,actor_id,snapshot)
values('${id}','${parent}','${ws}','${actor}','{"payload":{},"recipients":[],"attachments":[]}');`;

export function deliveryFoundationRaceScripts(kind) {
  const holder =
    kind === 'unique'
      ? deliveryAttemptInsert(attempt)
      : `select id from private.topic_announcement_delivery_attempts where id='${attempt}' for update;`;
  const contender =
    kind === 'unique'
      ? deliveryAttemptInsert(second)
      : `update private.topic_announcement_delivery_attempts set snapshot='{"payload":{"changed":true},"recipients":[],"attachments":[]}' where id='${attempt}';`;
  return {
    holder: `begin; set local statement_timeout='5s'; ${holder}\n\\echo FIXTURE_READY\n`,
    contender: `\\set VERBOSITY verbose\nset application_name='ttr-topic-foundation-contender'; set statement_timeout='5s';\n\\echo FIXTURE_READY\n${contender}`,
    expectedError: kind === 'unique' ? '23505' : '55000',
  };
}

export async function runTopicDeliveryFoundationConcurrency(metadata) {
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
insert into public.workspaces(id,name,personal,creator_id) values('${ws}','Synthetic foundation concurrency',false,'${actor}');
insert into private.topic_announcements(id,ws_id,title,topic,created_by) values('${parent}','${ws}','Synthetic notice','Synthetic topic','${actor}');`);
  for (const kind of ['unique', 'immutable']) {
    const scripts = deliveryFoundationRaceScripts(kind);
    const holder = openFixtureSession(
      spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    );
    let contender;
    try {
      holder.write(scripts.holder);
      await holder.marker;
      contender = openFixtureSession(
        spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
      );
      contender.end(scripts.contender);
      await contender.marker;
      // One bounded server observation proves a real database lock wait.
      const blocked = execute(
        `select pg_sleep(0.5); select count(*) from pg_stat_activity where application_name='ttr-topic-foundation-contender' and wait_event_type='Lock';`
      )
        .trim()
        .split('\n')
        .at(-1);
      assert.equal(
        blocked,
        '1',
        'competing connection must actually wait on the held database lock'
      );
      holder.end('commit;');
      assert.equal((await holder.done).code, 0);
      const result = await contender.done;
      assert.notEqual(result.code, 0);
      assert.match(result.errors, new RegExp(scripts.expectedError, 'u'));
      assert.equal(
        execute(
          `select count(*) from private.topic_announcement_delivery_attempts where announcement_id='${parent}';`
        ).trim(),
        '1'
      );
      assert.equal(
        execute(
          `select snapshot->'payload' from private.topic_announcement_delivery_attempts where id='${attempt}';`
        ).trim(),
        '{}'
      );
    } finally {
      holder.end('rollback;');
      contender?.end('rollback;');
      await Promise.allSettled([holder.done, contender?.done]);
    }
  }
  console.log(
    'Actual topic foundation unique-owner and immutable-snapshot contention passed'
  );
}
