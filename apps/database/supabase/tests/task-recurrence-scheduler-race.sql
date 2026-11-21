\ir helpers/local-dblink.inc
SET search_path = extensions, public;
SELECT plan(10);

-- The singleton and the exact-clock fixture require a freshly reset database.
SELECT (NOT request_enabled AND NOT scheduler_enabled
  AND NOT EXISTS (SELECT 1 FROM private.task_recurrence_slots)) AS reset_database
FROM private.task_recurrence_control \gset
\if :reset_database
\else
  SELECT fail('duplicate-worker fixture requires a freshly reset disposable database');
  SELECT * FROM finish();
  \quit 1
\endif

-- Avoid starting the multi-session fixture on the wall-clock slot boundary.
SELECT pg_sleep(CASE WHEN extract(epoch FROM clock_timestamp())::bigint % 900 > 895
  THEN 900 - extract(epoch FROM clock_timestamp())::bigint % 900 ELSE 0 END);
SELECT floor(extract(epoch FROM clock_timestamp())/900)::bigint*900 AS slot \gset

BEGIN;
\ir helpers/task-recurrence-scheduler-fixture.inc
COMMIT;

SELECT extensions.dblink_connect('recurrence_holder', pg_temp.fixture_dblink_connstr());
SELECT extensions.dblink_connect('recurrence_waiter', pg_temp.fixture_dblink_connstr());
SELECT extensions.dblink_connect('recurrence_gate', pg_temp.fixture_dblink_connstr());
SELECT extensions.dblink_exec('recurrence_holder','SET ROLE service_role');
SELECT extensions.dblink_exec('recurrence_waiter','SET ROLE service_role');

CREATE FUNCTION pg_temp.scheduler_duplicate(p_query text)
RETURNS TABLE(held jsonb, waited jsonb, blocked boolean)
LANGUAGE plpgsql AS $$
DECLARE
  holder integer;
  waiter integer;
  deadline timestamptz;
BEGIN
  SELECT pid INTO holder FROM extensions.dblink('recurrence_holder','SELECT pg_backend_pid()') AS p(pid integer);
  SELECT pid INTO waiter FROM extensions.dblink('recurrence_waiter','SELECT pg_backend_pid()') AS p(pid integer);
  PERFORM extensions.dblink_exec('recurrence_holder','BEGIN');
  SELECT result INTO held FROM extensions.dblink('recurrence_holder',p_query) AS row_result(result jsonb);
  PERFORM extensions.dblink_send_query('recurrence_waiter',p_query);
  deadline := clock_timestamp() + interval '1 second';
  LOOP
    blocked := holder = ANY(pg_blocking_pids(waiter));
    EXIT WHEN blocked OR clock_timestamp() >= deadline;
    PERFORM pg_sleep(0.01);
  END LOOP;
  PERFORM extensions.dblink_exec('recurrence_holder','COMMIT');
  SELECT result INTO waited FROM extensions.dblink_get_result('recurrence_waiter') AS row_result(result jsonb);
  PERFORM result FROM extensions.dblink_get_result('recurrence_waiter') AS row_result(result jsonb);
  RETURN NEXT;
END;
$$;

CREATE TEMP TABLE scheduler_race_assertions(
  batch integer, claimed boolean, settled boolean, tokens integer, generated integer, stop_gate_skipped boolean
);
CREATE FUNCTION pg_temp.run_scheduler_dupes(p_slot bigint,p_gated_ws uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  batch_num integer;
  claim record;
  commit_record record;
  items jsonb;
  stop_gate_skipped boolean;
BEGIN
  PERFORM extensions.dblink_exec('recurrence_gate','BEGIN');
  PERFORM extensions.dblink_exec('recurrence_gate',format(
    'UPDATE private.task_recurrence_workspace SET enabled=false WHERE ws_id=%L',p_gated_ws
  ));
  FOR batch_num IN 1..5 LOOP
    SELECT * INTO STRICT claim FROM pg_temp.scheduler_duplicate(
      format('SELECT private.task_recurrence_claim(%s,%s::smallint)',p_slot,batch_num)
    );
    IF batch_num = 1 THEN
      SELECT NOT EXISTS (SELECT 1 FROM private.task_recurrence_claims
        WHERE slot=p_slot AND batch=1 AND ws_id=p_gated_ws) INTO stop_gate_skipped;
      PERFORM extensions.dblink_exec('recurrence_gate','ROLLBACK');
    END IF;
    SELECT jsonb_agg(jsonb_build_object('token', part.value)) INTO items FROM jsonb_array_elements(claim.held->'tokens') AS part(value);
    SELECT * INTO STRICT commit_record FROM pg_temp.scheduler_duplicate(format(
      'SELECT private.task_recurrence_commit(%s,%s::smallint,%L::jsonb)',p_slot,batch_num,items
    ));
    INSERT INTO scheduler_race_assertions VALUES (
      batch_num,claim.blocked AND claim.held = claim.waited,commit_record.blocked AND commit_record.held = commit_record.waited,
      jsonb_array_length(claim.held->'tokens'),(commit_record.held->>'created')::integer,stop_gate_skipped
    );
  END LOOP;
END;
$$;

SELECT pg_temp.run_scheduler_dupes(:'slot',(SELECT ws FROM scheduler_workspaces WHERE ordinal=1));
SELECT ok((SELECT stop_gate_skipped FROM scheduler_race_assertions WHERE batch=1),
  'claim rotates around a workspace while its durable stop holds the gate');
SELECT is((SELECT count(*) FROM scheduler_race_assertions WHERE claimed),5::bigint,'duplicate claims wait and replay across five batches');
SELECT is((SELECT count(*) FROM scheduler_race_assertions WHERE settled),5::bigint,'duplicate commits wait and replay across five batches');
SELECT is((SELECT count(*) FROM scheduler_race_assertions WHERE tokens=32 AND generated=32),5::bigint,
  'each batch is capped at 32 distinct generated tasks');
SELECT is((SELECT sum(reserved) FROM private.task_recurrence_slot_workspaces WHERE slot=:'slot'),160::bigint,'concurrent workers reserve exactly 160');
SELECT is((SELECT max(reserved) FROM private.task_recurrence_slot_workspaces WHERE slot=:'slot'),32::smallint,
  'concurrent workers leave each workspace at its cap');
SELECT is((SELECT count(*) FROM private.task_recurrence_claims WHERE slot=:'slot' AND state='created'),160::bigint,
  'all admitted tokens have one terminal settlement');
SELECT is((SELECT count(*) FROM private.task_recurrence_occurrences WHERE source='scheduler'),160::bigint,'replay does not generate duplicate tasks');
SELECT is((SELECT count(*) FROM private.task_recurrence_claims WHERE ws_id=(SELECT ws FROM scheduler_workspaces WHERE ordinal=6)),
  0::bigint,'a disabled workspace is excluded through all batches');
SELECT ok((SELECT finalized FROM private.task_recurrence_slots WHERE slot=:'slot'),'duplicate workers leave a finalized slot');

SELECT extensions.dblink_disconnect('recurrence_holder');
SELECT extensions.dblink_disconnect('recurrence_waiter');
SELECT extensions.dblink_disconnect('recurrence_gate');

BEGIN;
DELETE FROM private.task_recurrence_slots WHERE slot=:'slot';
UPDATE private.task_recurrence_scheduler SET latest_slot=0,seek_ws_id=NULL WHERE singleton;
UPDATE private.task_recurrence_control SET request_enabled=false,scheduler_enabled=false WHERE singleton;
DELETE FROM public.workspaces WHERE id IN (SELECT ws FROM scheduler_workspaces);
DELETE FROM auth.users WHERE id='00000000-0000-4000-8000-0000000d1101';
COMMIT;
SELECT * FROM finish();
