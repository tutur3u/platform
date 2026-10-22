import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
  function createFixture() {
    const actor = randomUUID();
    const ws = randomUUID();
    execute(`insert into auth.users(id) values('${actor}');
    insert into public.users(id) values('${actor}') on conflict do nothing;
    insert into public.workspaces(id,name,personal,creator_id) values('${ws}','Synthetic SSO race',false,'${actor}');`);
    const client = execute(
      `select (public.sso_manage_client('${ws}','${actor}',null,0,'Race',array['example.test'],'urn:race:sp',array['https://sp.example.test/acs'])).id;`
    );
    execute(`select public.sso_manage_client('${ws}','${actor}','${client}',1,'Race',array['example.test'],'urn:race:sp',array['https://sp.example.test/acs'],true);
    select public.sso_set_assignment('${ws}','${client}','${actor}','${actor}',0,true);`);
    const transaction = execute(
      `select (public.sso_create_transaction('${ws}','${client}',2,'_race',encode(extensions.digest('${actor}','sha256'),'hex'),repeat('b',64),null,'https://sp.example.test/acs',clock_timestamp()+interval '4 minutes',true)).id;`
    );
    execute(
      `select public.sso_record_consent('${ws}','${client}','${transaction}','${actor}',repeat('b',64),repeat('c',64),2,true);`
    );
    const consume = `select public.sso_consume_transaction('${ws}','${client}','${transaction}','${actor}',repeat('b',64),repeat('c',64),2);`;
    return { actor, ws, client, transaction, consume };
  }

  async function contend(label, holder, competitor, rejection) {
    const first = openFixtureSession(
      spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    );
    let second;
    try {
      first.write(
        `begin; set local statement_timeout='5s'; ${holder}\n\\echo FIXTURE_READY\n`
      );
      await first.marker;
      second = openFixtureSession(
        spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
      );
      second.end(
        `\\set VERBOSITY verbose\nset application_name='sso-consume-competitor'; set statement_timeout='5s';\n\\echo FIXTURE_READY\nbegin; ${competitor} commit;`
      );
      await second.marker;
      first.end(`do $wait$ declare deadline timestamptz:=clock_timestamp()+interval '3 seconds'; begin
      loop exit when exists(select 1 from pg_stat_activity where application_name='sso-consume-competitor'
        and wait_event_type='Lock' and pg_backend_pid()=any(pg_blocking_pids(pid)));
        if clock_timestamp()>deadline then raise exception '${label}: competitor did not wait for holder'; end if;
        perform pg_sleep(0.01);
      end loop; end $wait$; commit;`);
      const [winner, loser] = await Promise.all([first.done, second.done]);
      assert.equal(winner.code, 0, `${label}: ${winner.errors}`);
      if (rejection) {
        assert.notEqual(loser.code, 0, `${label}: competitor must reject`);
        assert.match(loser.errors, rejection, label);
      } else assert.equal(loser.code, 0, `${label}: ${loser.errors}`);
    } finally {
      first.end('rollback;');
      await Promise.allSettled(
        second ? [first.done, second.done] : [first.done]
      );
    }
  }

  function assertConsumption({ transaction, ws, client }, expected) {
    assert.equal(
      execute(
        `select count(*) from private.sso_audit_events where transaction_id='${transaction}' and event_type='transaction.consumed';`
      ),
      String(expected)
    );
    assert.equal(
      execute(
        `select count(*) from private.sso_subjects where ws_id='${ws}' and client_id='${client}';`
      ),
      String(expected)
    );
    assert.equal(
      execute(`select count(*) from private.sso_transactions where id='${transaction}'
        and consumed_at is not null and outcome='approved';`),
      String(expected)
    );
  }

  const replay = createFixture();
  await contend(
    'replay',
    replay.consume,
    replay.consume,
    /40001:.*sso_transaction_unavailable/u
  );
  assertConsumption(replay, 1);
  console.log(
    'SSO two-connection race: 1 winner, 1 replay rejection, 1 consumed audit, 1 subject'
  );

  for (const kind of ['membership removal', 'assignment revocation']) {
    for (const revokeFirst of [true, false]) {
      const data = createFixture();
      const { ws, client, actor, consume } = data;
      const membership = `ws_id='${ws}' and user_id='${actor}'`;
      const assignment = `${membership} and client_id='${client}'`;
      // The management RPC also locks the client; direct DML isolates the
      // authorization-row locks that consumption must retain until commit.
      const revoke =
        kind === 'membership removal'
          ? `delete from public.workspace_members where ${membership};`
          : `update private.sso_assignments set active=false where ${assignment};`;
      const label = `${kind}, ${revokeFirst ? 'revocation' : 'consume'} first`;
      await contend(
        label,
        revokeFirst ? revoke : consume,
        revokeFirst ? consume : revoke,
        revokeFirst ? /42501:.*sso_forbidden/u : null
      );
      assertConsumption(data, revokeFirst ? 0 : 1);
      assert.equal(
        execute(
          `select count(*) from private.sso_assignments where ${assignment} and active;`
        ),
        '0',
        label
      );
      assert.equal(
        execute(
          `select count(*) from public.workspace_members where ${membership};`
        ),
        kind === 'membership removal' ? '0' : '1',
        label
      );
      // A serially earlier consume is permitted, but no subsequent consume is.
      const denied = execute(`do $deny$ begin
        ${consume}
        raise exception 'revoked actor consumed';
        exception when insufficient_privilege then
          if sqlerrm <> 'sso_forbidden' then raise; end if;
      end $deny$;`);
      assert.equal(denied, 'DO', label);
      assertConsumption(data, revokeFirst ? 0 : 1);
      console.log(
        `SSO revocation race: ${label}; ${revokeFirst ? 'consume denied, no audit or subject' : 'consume committed before revocation'}; later consume denied`
      );
    }
  }
  // Committed synthetic rows belong only to this disposable database. The lifecycle
  // stops it without backup; audit immutability is preserved during teardown.
}
