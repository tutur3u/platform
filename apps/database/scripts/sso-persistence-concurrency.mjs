import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  deriveIsolatedIdentity,
  readLifecycleMetadata,
} from './run-supabase-isolated.js';
import { openFixtureSession } from './time-tracker-control-concurrency.mjs';

export async function runSsoConsumptionRace(metadata) {
  const admitted = await readLifecycleMetadata(metadata.disposableRoot);
  const identity = deriveIsolatedIdentity({
    headSha: metadata.headSha,
    repositoryPath: metadata.repositoryRoot,
  });
  assert.equal(admitted.projectId, identity.projectId);
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
    }).trim();
  const actor = '00000000-0000-4000-8000-000000009201';
  const ws = '00000000-0000-4000-8000-000000009211';
  execute(`insert into auth.users(id) values('${actor}');
    insert into public.users(id) values('${actor}') on conflict do nothing;
    insert into public.workspaces(id,name,personal,creator_id) values('${ws}','Synthetic SSO race',false,'${actor}');`);
  const client = execute(
    `select (public.sso_manage_client('${ws}','${actor}',null,0,'Race',array['example.test'],'urn:race:sp',array['https://sp.example.test/acs'])).id;`
  );
  execute(`select public.sso_manage_client('${ws}','${actor}','${client}',1,'Race',array['example.test'],'urn:race:sp',array['https://sp.example.test/acs'],true);
    select public.sso_set_assignment('${ws}','${client}','${actor}','${actor}',0,true);`);
  const transaction = execute(
    `select (public.sso_create_transaction('${ws}','${client}',2,'_race',repeat('a',64),repeat('b',64),null,'https://sp.example.test/acs',clock_timestamp()+interval '4 minutes',true)).id;`
  );
  execute(
    `select public.sso_record_consent('${ws}','${client}','${transaction}','${actor}',repeat('b',64),repeat('c',64),2,true);`
  );
  const consume = `select public.sso_consume_transaction('${ws}','${client}','${transaction}','${actor}',repeat('b',64),repeat('c',64),2);`;
  const first = openFixtureSession(
    spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
  );
  let second;
  try {
    first.write(
      `begin; set local statement_timeout='5s'; ${consume}\n\\echo FIXTURE_READY\n`
    );
    await first.marker;
    second = openFixtureSession(
      spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    );
    second.end(
      `\\set VERBOSITY verbose\nset application_name='sso-consume-competitor'; set statement_timeout='5s';\n\\echo FIXTURE_READY\n${consume}`
    );
    await second.marker;
    first.end(`do $wait$ declare deadline timestamptz:=clock_timestamp()+interval '3 seconds'; begin
      loop exit when exists(select 1 from pg_stat_activity where application_name='sso-consume-competitor' and wait_event_type='Lock');
        if clock_timestamp()>deadline then raise exception 'Competitor did not wait'; end if;
        perform pg_sleep(0.01);
      end loop; end $wait$; commit;`);
    const [winner, loser] = await Promise.all([first.done, second.done]);
    assert.equal(winner.code, 0, winner.errors);
    assert.notEqual(loser.code, 0);
    assert.match(loser.errors, /40001:.*sso_transaction_unavailable/u);
    assert.equal(
      execute(
        `select count(*) from private.sso_audit_events where transaction_id='${transaction}' and event_type='transaction.consumed';`
      ),
      '1'
    );
    assert.equal(
      execute(
        `select count(*) from private.sso_subjects where ws_id='${ws}' and client_id='${client}';`
      ),
      '1'
    );
    console.log(
      'SSO two-connection race: 1 winner, 1 replay rejection, 1 consumed audit, 1 subject'
    );
  } finally {
    first.end('rollback;');
    if (second) await Promise.allSettled([first.done, second.done]);
    else await Promise.allSettled([first.done]);
  }
  // Committed synthetic rows belong only to this disposable database. The lifecycle
  // stops it without backup; audit immutability is preserved during teardown.
}
