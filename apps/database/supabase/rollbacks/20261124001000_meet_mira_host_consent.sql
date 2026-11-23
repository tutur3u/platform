-- Disable the room Mira acceptance, choice and consent-default consumers
-- before this rollback. Dropping the tables discards consent evidence; export
-- it first when it must be retained. The transcript consent pseudonym trigger
-- is restored to its guest-label form.
DROP TRIGGER IF EXISTS anonymize_meet_mira_evidence ON auth.users;
DROP TABLE IF EXISTS private.workspace_mira_consent_defaults;
DROP TABLE IF EXISTS private.meet_mira_participant_choices;
DROP TABLE IF EXISTS private.meet_mira_host_acceptances;
DROP FUNCTION IF EXISTS private.prepare_meet_mira_participant_choice();
DROP FUNCTION IF EXISTS private.end_meet_mira_acceptance(uuid, integer, uuid, text);
DROP FUNCTION IF EXISTS private.record_meet_mira_acceptance(uuid, uuid, text, text[]);
DROP FUNCTION IF EXISTS private.anonymize_meet_mira_evidence();
DROP FUNCTION IF EXISTS private.stamp_meet_mira_evidence();
DROP FUNCTION IF EXISTS private.protect_meet_mira_evidence();

CREATE OR REPLACE FUNCTION private.prepare_meet_ai_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  existing_ref uuid;
BEGIN
  PERFORM 1 FROM public.meet_ai_sessions WHERE id = new.session_id FOR UPDATE;
  IF new.user_id IS NOT NULL THEN
    new.guest_label := NULL;
    SELECT c.participant_ref INTO existing_ref FROM private.meet_ai_consents c
      WHERE c.session_id = new.session_id AND c.user_id = new.user_id
      ORDER BY c.created_at, c.id LIMIT 1;
  ELSIF new.guest_label IS NOT NULL THEN
    SELECT c.participant_ref INTO existing_ref FROM private.meet_ai_consents c
      WHERE c.session_id = new.session_id AND c.user_id IS NULL
        AND c.guest_label = new.guest_label
      ORDER BY c.created_at, c.id LIMIT 1;
  ELSE
    SELECT c.participant_ref INTO existing_ref FROM private.meet_ai_consents c
      WHERE c.session_id = new.session_id AND c.user_id IS NULL
        AND c.guest_label IS NULL AND c.participant_ref = new.participant_ref
      LIMIT 1;
  END IF;
  new.participant_ref := coalesce(existing_ref, gen_random_uuid());
  RETURN new;
END;
$$;
