-- Name the task fleet field limits with the strict-field convention used by
-- every other public text and JSON column. Each bound equals the value that
-- public.enforce_strict_text_field_limits() already applies to writes on
-- public.tasks, so no accepted write changes. The fleet shape and non-empty
-- CHECKs stay in place because they carry additional rules.
SET LOCAL lock_timeout = '3s';

-- tuturuuu: reviewed(dynamic-sql-review): static limit-function comparison; no EXECUTE or data writes.
DO $$
BEGIN
  IF public.strict_text_field_char_limit('tasks', 'needs_user_reason') <> 512
    OR public.strict_text_field_byte_limit('tasks', 'needs_user_reason') <> 2048
    OR public.strict_payload_field_byte_limit('tasks', 'virtual_assignees') <> 8192
    OR public.strict_payload_field_byte_limit('tasks', 'task_resources') <> 8192
  THEN
    RAISE EXCEPTION 'Task fleet strict field limits differ from the enforced limits';
  END IF;
END;
$$;

ALTER TABLE public.tasks
  ADD CONSTRAINT needs_user_reason_strict_length_check
    CHECK (char_length(needs_user_reason) <= 512) NOT VALID,
  ADD CONSTRAINT needs_user_reason_strict_bytes_check
    CHECK (octet_length(needs_user_reason) <= 2048) NOT VALID,
  ADD CONSTRAINT virtual_assignees_strict_payload_size_check
    CHECK (octet_length((virtual_assignees)::text) <= 8192) NOT VALID,
  ADD CONSTRAINT task_resources_strict_payload_size_check
    CHECK (octet_length((task_resources)::text) <= 8192) NOT VALID;

ALTER TABLE public.tasks VALIDATE CONSTRAINT needs_user_reason_strict_length_check;
ALTER TABLE public.tasks VALIDATE CONSTRAINT needs_user_reason_strict_bytes_check;
ALTER TABLE public.tasks VALIDATE CONSTRAINT virtual_assignees_strict_payload_size_check;
ALTER TABLE public.tasks VALIDATE CONSTRAINT task_resources_strict_payload_size_check;
