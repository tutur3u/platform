BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, public;
SELECT no_plan();
SELECT floor(extract(epoch FROM clock_timestamp())/900)::bigint*900 AS slot \gset

SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
SELECT is(private.task_recurrence_claim(:'slot',1::smallint), '{"status":"stopped"}'::jsonb,
  'scheduler has no admission while the database is dormant');
RESET ROLE;
SELECT is((SELECT count(*) FROM private.task_recurrence_slots),0::bigint,'dormant claim creates no slot');

\ir helpers/task-recurrence-scheduler-fixture.inc

-- A left-over reservation from the previous slot loses authority at rollover.
UPDATE private.task_recurrence_scheduler SET latest_slot = :'slot'::bigint - 900;
INSERT INTO private.task_recurrence_slots(slot,global_epoch,reserved) VALUES (:'slot'::bigint - 900,1,1);
INSERT INTO private.task_recurrence_batches(slot,batch,examined,exhausted) VALUES (:'slot'::bigint - 900,1,1,false);
INSERT INTO private.task_recurrence_claims(slot,batch,position,series_id,ws_id,cursor_date,revision,progress,
  workspace_epoch,planned_at,expires_at)
SELECT :'slot'::bigint - 900,1,1,id,ws_id,cursor_date,revision,progress,1,
  to_timestamp(:'slot'::bigint - 900),to_timestamp(:'slot'::bigint - 720)
FROM private.task_recurrence_series WHERE id=(SELECT series_id FROM scheduler_series_fixture WHERE ordinal=1 AND seq=1);

CREATE FUNCTION pg_temp.scheduler_fixture_fault()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.name = 'scheduler fault fixture' THEN
    RAISE EXCEPTION 'TASK_CAPACITY_EXCEEDED';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER scheduler_fixture_fault BEFORE INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION pg_temp.scheduler_fixture_fault();

SET LOCAL ROLE service_role;
SELECT throws_ok(format('SELECT private.task_recurrence_claim(%s,2::smallint)', :'slot'),
  'PT409','TASK_RECURRENCE_BATCH_ORDER','batch two cannot overtake batch one');
SELECT private.task_recurrence_claim(:'slot',1::smallint)::text AS batch_claim \gset
SELECT is(jsonb_array_length(:'batch_claim'::jsonb->'tokens'),32,'first batch is capped at 32');
SELECT is(private.task_recurrence_claim(:'slot',1::smallint), :'batch_claim'::jsonb,'duplicate claim replays the same tokens');
SELECT is(private.task_recurrence_commit(:'slot'::bigint - 900,1::smallint,'[]'),'{"status":"stale"}'::jsonb,
  'the previous slot cannot settle after the watermark advances');
SELECT throws_ok(format($sql$SELECT private.task_recurrence_commit(%s,1::smallint,
  '[{"token":"00000000-0000-4000-8000-000000000001"}]')$sql$, :'slot'),
  'PT409','TASK_RECURRENCE_BATCH_TOKENS','a token outside the batch cannot be redeemed');
RESET ROLE;
SELECT is((SELECT count(DISTINCT ws_id) FROM private.task_recurrence_claims WHERE slot=:'slot' AND batch=1),5::bigint,
  'the first batch rotates across all five enabled workspaces');
SELECT is((SELECT state FROM private.task_recurrence_claims WHERE slot=:'slot'::bigint - 900),'expired',
  'rollover reconciles the previous slot');
SELECT is((SELECT count(*) FROM private.task_recurrence_claims WHERE
  slot=:'slot' AND expires_at - planned_at > interval '180 seconds'),0::bigint,'leases are at most 180 seconds');
SELECT is((SELECT count(*) FROM private.task_recurrence_claims WHERE
  slot=:'slot' AND expires_at > to_timestamp(:'slot'::bigint + 900)),0::bigint,'leases end at the slot boundary');

UPDATE private.task_recurrence_claims SET planned_at=clock_timestamp()-interval '2 minutes',
  expires_at=clock_timestamp()-interval '1 second'
WHERE token=(SELECT token FROM private.task_recurrence_claims AS claim JOIN scheduler_series_fixture AS fixture
  ON fixture.series_id=claim.series_id
  WHERE slot=:'slot' AND batch=1 AND NOT (fixture.ordinal=1 AND fixture.seq=1) LIMIT 1);
SELECT jsonb_agg(jsonb_build_object('token',token) ORDER BY position)::text AS items
FROM private.task_recurrence_claims WHERE slot=:'slot' AND batch=1 \gset
SET LOCAL ROLE service_role;
SELECT private.task_recurrence_commit(:'slot',1::smallint,:'items'::jsonb)::text AS settled \gset
SELECT is((:'settled'::jsonb->>'expired')::integer,1,'expired tokens create no task');
SELECT is((:'settled'::jsonb->>'failed')::integer,1,'the known failure is settled per item');
SELECT is((:'settled'::jsonb->>'created')::integer,30,'other items commit after a failed savepoint');
SELECT is(private.task_recurrence_commit(:'slot',1::smallint,:'items'::jsonb),:'settled'::jsonb,
  'a lost commit response can be replayed');
RESET ROLE;
SELECT is((SELECT state FROM private.task_recurrence_series WHERE id=(
  SELECT series_id FROM scheduler_series_fixture WHERE ordinal=1 AND seq=1
)),'paused','five consecutive known generation failures pause the series');

CREATE FUNCTION pg_temp.finish_scheduler_batch(p_slot bigint,p_batch smallint)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog,pg_temp AS $$
DECLARE
  claimed jsonb := private.task_recurrence_claim(p_slot,p_batch);
  items jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object('token',part.value)), '[]'::jsonb) INTO items
  FROM jsonb_array_elements(claimed->'tokens') AS part(value);
  RETURN private.task_recurrence_commit(p_slot,p_batch,items);
END;
$$;
SELECT is(pg_temp.finish_scheduler_batch(:'slot',2::smallint)->>'status','committed','batch two settles');
SELECT is(pg_temp.finish_scheduler_batch(:'slot',3::smallint)->>'status','committed','batch three settles');
SELECT is(pg_temp.finish_scheduler_batch(:'slot',4::smallint)->>'status','committed','batch four settles');
SELECT is(pg_temp.finish_scheduler_batch(:'slot',5::smallint)->>'status','committed','batch five settles');
SELECT is((SELECT reserved FROM private.task_recurrence_slots WHERE slot=:'slot'),160::smallint,'slot reservation is capped at 160');
SELECT is((SELECT count(*) FROM private.task_recurrence_slot_workspaces WHERE slot=:'slot' AND reserved=32),5::bigint,
  'exactly 32 reservations per admitted workspace');
SELECT is((SELECT count(*) FROM private.task_recurrence_claims WHERE slot=:'slot'),160::bigint,
  'one claim per series accounts for the full reservation');
SELECT is((SELECT count(*) FROM private.task_recurrence_occurrences WHERE source='scheduler'),158::bigint,
  'replays plus expiry and known faults produce exactly 158 occurrences');
SELECT is((SELECT count(*) FROM private.task_recurrence_claims WHERE ws_id=(SELECT ws FROM scheduler_workspaces WHERE ordinal=6)),
  0::bigint,'disabled workspaces create no leases');
SELECT ok((SELECT finalized FROM private.task_recurrence_slots WHERE slot=:'slot'),'the fifth settlement finalizes the slot');
-- Start a separate admission scenario over the remaining active fixtures.
SAVEPOINT workspace_stop_fixture;
DELETE FROM private.task_recurrence_slots WHERE slot=:'slot';
UPDATE private.task_recurrence_scheduler SET latest_slot=:'slot'::bigint - 900 WHERE singleton;
SELECT private.task_recurrence_claim(:'slot',1::smallint);
SELECT ws AS stopping_ws FROM scheduler_workspaces WHERE ordinal=2 \gset
SELECT COUNT(*) AS stopped_tokens FROM private.task_recurrence_claims WHERE slot=:'slot' AND ws_id=:'stopping_ws' \gset
SELECT ok(:'stopped_tokens'::integer > 0,'the workspace held live tokens before stopping');
SELECT private.task_recurrence_disable_workspace(:'stopping_ws',1);
SELECT jsonb_agg(jsonb_build_object('token',token))::text AS after_stop_items
FROM private.task_recurrence_claims WHERE slot=:'slot' AND batch=1 \gset
SELECT is((private.task_recurrence_commit(:'slot',1::smallint,:'after_stop_items')->>'stale')::integer,
  :'stopped_tokens'::integer,'a committed workspace disable makes its prior tokens stale');
ROLLBACK TO SAVEPOINT workspace_stop_fixture;

-- Verify catch-up independently from the slot capacity fixtures. Frozen slot
-- time, rather than Worker retry time, chooses today's eligible occurrence.
SAVEPOINT catchup_fixture;
SELECT id AS catchup_series FROM private.task_recurrence_series
WHERE state='active' AND ws_id=(SELECT ws FROM scheduler_workspaces WHERE ordinal=5)
ORDER BY id LIMIT 1 \gset
SELECT (to_timestamp(:'slot'::bigint) AT TIME ZONE 'UTC')::date AS slot_day \gset
UPDATE private.task_recurrence_series SET
  anchor_date=:'slot_day'::date - 3, cursor_date=:'slot_day'::date - 3,
  generate_at=((:'slot_day'::date - 3)::timestamp AT TIME ZONE 'UTC'),
  rule=jsonb_set(rule,'{end,count}','10')
WHERE id=:'catchup_series';
SELECT private.task_recurrence_scheduler_step(series,:'slot',clock_timestamp()+interval '3 minutes')::text AS catchup
FROM private.task_recurrence_series AS series WHERE id=:'catchup_series' \gset
SELECT is((:'catchup'::jsonb->>'downtime_skipped')::integer,3,'catch-up accounts for three overdue dates');
SELECT is((SELECT occurrence_date FROM private.task_recurrence_occurrences WHERE series_id=:'catchup_series'),
  :'slot_day'::date,'catch-up creates only the eligible current occurrence');
SELECT is((SELECT consumed_count FROM private.task_recurrence_series WHERE id=:'catchup_series'),4,
  'skipped dates and materialization consume COUNT once each');
ROLLBACK TO SAVEPOINT catchup_fixture;

SELECT private.task_recurrence_disable_control(1);
SELECT is(private.task_recurrence_claim(:'slot',1::smallint),'{"status":"stopped"}'::jsonb,
  'durable database stop refuses duplicate and new claims');
SELECT is(private.task_recurrence_commit(:'slot',1::smallint,:'items'::jsonb),:'settled'::jsonb,
  'a read-only receipt can replay after the stop');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT * FROM finish();
ROLLBACK;
