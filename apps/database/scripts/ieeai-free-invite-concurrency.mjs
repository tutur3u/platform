import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { openFixtureSession } from './time-tracker-control-concurrency.mjs';

const ws = 'a65cebd7-3a8c-4883-a3d9-82f9703d652f';

export async function runIeeaiInviteRaces(args, execute) {
  const creator = randomUUID();
  const product = randomUUID();
  execute(`SET request.jwt.claims='{}';
    INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${creator}','${creator}@example.test',now());
    INSERT INTO public.users(id) VALUES('${creator}') ON CONFLICT DO NOTHING;
    INSERT INTO public.workspaces(id,name,personal,creator_id) VALUES('${ws}','Synthetic race fixture',false,'${creator}');
    INSERT INTO private.workspace_subscription_products(id,tier,pricing_model,price,archived)
      VALUES('${product}','FREE','free',0,false);
    INSERT INTO public.workspace_subscriptions(ws_id,polar_subscription_id,product_id,status)
      VALUES('${ws}','${creator}','${product}','active');`);

  function fixture() {
    const actor = randomUUID();
    execute(`SET request.jwt.claims='{}';
      INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${actor}','${actor}@example.test',now());
      INSERT INTO public.users(id) VALUES('${actor}') ON CONFLICT DO NOTHING;
      INSERT INTO public.workspace_invites(ws_id,user_id,type) VALUES('${ws}','${actor}','MEMBER');`);
    const accept = `SET LOCAL request.jwt.claims='{"role":"service_role"}';
      SET LOCAL ROLE service_role;
      SELECT private.accept_ieeai_free_workspace_invite('ieeai-stats','${ws}','${actor}',ARRAY['${ws}'::uuid]);
      RESET ROLE;`;
    return { actor, accept };
  }

  async function contend(label, holderSql, competitorSql) {
    const first = openFixtureSession(
      spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    );
    let second;
    try {
      first.write(
        `BEGIN; SET LOCAL statement_timeout='8s'; ${holderSql}\n\\echo FIXTURE_READY\n`
      );
      await first.marker;
      second = openFixtureSession(
        spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
      );
      second.end(`SET application_name='ieeai-fixture-competitor';
        SET statement_timeout='8s';\n\\echo FIXTURE_READY\nBEGIN; ${competitorSql} COMMIT;`);
      await second.marker;
      first.end(`DO $wait$ DECLARE deadline timestamptz:=clock_timestamp()+interval '2 seconds'; BEGIN
        LOOP
          EXIT WHEN EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='ieeai-fixture-competitor'
            AND wait_event_type='Lock' AND pg_backend_pid()=ANY(pg_blocking_pids(pid)));
          IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'Competitor did not block'; END IF;
          PERFORM pg_sleep(0.01);
        END LOOP;
      END $wait$; COMMIT;`);
      const results = await Promise.all([first.done, second.done]);
      for (const result of results)
        assert.equal(result.code, 0, `${label}: ${result.errors}`);
      console.log(
        `${label}: observed competitor blocked by holder PID, both sessions completed`
      );
    } finally {
      first.end('ROLLBACK;');
      await Promise.allSettled(
        second ? [first.done, second.done] : [first.done]
      );
    }
  }

  function check(actor, accepted) {
    assert.equal(
      execute(
        `SELECT count(*) FROM public.workspace_members WHERE ws_id='${ws}' AND user_id='${actor}';`
      ).trim(),
      String(accepted)
    );
    assert.equal(
      execute(
        `SELECT count(*) FROM private.ieeai_invite_acceptances WHERE workspace_id='${ws}' AND actor_id='${actor}';`
      ).trim(),
      String(accepted)
    );
    assert.equal(
      execute(
        `SELECT count(*) FROM public.workspace_invites WHERE ws_id='${ws}' AND user_id='${actor}';`
      ).trim(),
      String(1 - accepted)
    );
  }

  const duplicate = fixture();
  await contend('double acceptance', duplicate.accept, duplicate.accept);
  check(duplicate.actor, 1);

  const upgraded = fixture();
  const upgrade = `UPDATE private.workspace_subscription_products SET tier='PRO',pricing_model='seat_based',price=1900 WHERE id='${product}';`;
  await contend('product upgrade wins', upgrade, upgraded.accept);
  check(upgraded.actor, 0);
  execute(
    `UPDATE private.workspace_subscription_products SET tier='FREE',pricing_model='free',price=0 WHERE id='${product}';`
  );

  const inserting = fixture();
  const paid = randomUUID();
  execute(
    `INSERT INTO private.workspace_subscription_products(id,tier,pricing_model,price,archived) VALUES('${paid}','PRO','seat_based',1900,false);`
  );
  const insertPaid = `INSERT INTO public.workspace_subscriptions(ws_id,polar_subscription_id,product_id,status) VALUES('${ws}','${paid}','${paid}','active');`;
  await contend(
    'subscription insert upgrade wins',
    insertPaid,
    inserting.accept
  );
  check(inserting.actor, 0);
  execute(
    `DELETE FROM public.workspace_subscriptions WHERE polar_subscription_id='${paid}';`
  );

  const accepted = fixture();
  await contend(
    'acceptance serializes before upgrade',
    accepted.accept,
    upgrade
  );
  check(accepted.actor, 1);
  console.log('transaction/concurrency controls: passed');
}
