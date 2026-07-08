ALTER TYPE "public"."external_project_adapter_kind"
ADD VALUE IF NOT EXISTS 'richfield';

GRANT SELECT, INSERT, UPDATE, DELETE
ON "public"."workspace_external_project_bindings"
TO service_role;

CREATE OR REPLACE FUNCTION "private"."update_richfield_contact_submission_status"(
  "p_ws_id" uuid,
  "p_entry_id" uuid,
  "p_email_notification_status" text
)
RETURNS SETOF "public"."workspace_external_project_entries"
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private
AS $$
  UPDATE "public"."workspace_external_project_entries" AS "entry"
  SET
    "metadata" = CASE
        WHEN jsonb_typeof("entry"."metadata") = 'object'
          THEN "entry"."metadata"
        ELSE '{}'::jsonb
      END
      || jsonb_build_object(
        'emailNotificationStatus',
        "p_email_notification_status",
        'privateDelivery',
        true
      ),
    "profile_data" = CASE
        WHEN jsonb_typeof("entry"."profile_data") = 'object'
          THEN "entry"."profile_data"
        ELSE '{}'::jsonb
      END
      || jsonb_build_object(
        'emailNotificationStatus',
        "p_email_notification_status"
      ),
    "updated_by" = NULL
  FROM "public"."workspace_external_project_collections" AS "collection"
  WHERE "entry"."ws_id" = "p_ws_id"
    AND "entry"."id" = "p_entry_id"
    AND "collection"."id" = "entry"."collection_id"
    AND "collection"."ws_id" = "entry"."ws_id"
    AND "collection"."slug" = 'contact-submissions'
  RETURNING "entry".*;
$$;

REVOKE ALL
ON FUNCTION "private"."update_richfield_contact_submission_status"(uuid, uuid, text)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "private"."update_richfield_contact_submission_status"(uuid, uuid, text)
TO service_role;

notify pgrst, 'reload schema';
