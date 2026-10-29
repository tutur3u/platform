-- Run from the repository root. Read the actual rollback file for every guard control.
\set ON_ERROR_STOP on
CREATE OR REPLACE FUNCTION pg_temp.expect_rollback_refusal(p_sql text, p_message text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE refused boolean := false;
BEGIN
 BEGIN
  EXECUTE p_sql;
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE p_message || '%' THEN RAISE; END IF;
  refused := true;
 END;
 IF NOT refused THEN RAISE EXCEPTION 'Rollback unexpectedly accepted retained data' USING ERRCODE='XX000'; END IF;
END $fn$;

BEGIN;
INSERT INTO public.users(id) VALUES ('a6743000-0000-4000-8000-000000000001');
INSERT INTO public.workspaces(id,name,creator_id) VALUES ('a6743000-0000-4000-8000-000000000011','Rollback guard','a6743000-0000-4000-8000-000000000001');
INSERT INTO private.chat_creation_requests(conversation_id,actor_user_id,ws_id,request_id,conversation_type,initial_settings)
VALUES(gen_random_uuid(),'a6743000-0000-4000-8000-000000000001','a6743000-0000-4000-8000-000000000011',gen_random_uuid(),'ai','{}');

\set rollback_sql `sed '/^BEGIN;$/d; /^COMMIT;$/d' apps/database/rollbacks/20261029100000_chat_first_message_creation_receipts.rollback.sql`
SELECT pg_temp.expect_rollback_refusal(:'rollback_sql', 'Rollback refused:');
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM private.chat_creation_requests) THEN RAISE EXCEPTION 'Rollback lost retained fixture'; END IF; END $$;
ROLLBACK;
\echo PASS retained-data guard 20261029100000_chat_first_message_creation_receipts.rollback
