-- Not a migration: release-authority approval only.
-- Restoring the report bodies removes their caller guards. ACLs remain closed:
-- this file never grants PUBLIC, anon or authenticated on admin-only functions.
-- The dropped notification overloads are BROKEN: public.notification_batches
-- no longer exists. The obsolete body-local path override is omitted.
-- They are not needed by current callers and stay absent by
-- default. Only if an approved recovery explicitly needs their old definitions,
-- SET LOCAL tuturuuu.restore_broken_notification_overloads = 'on' in the same
-- transaction before running this file (or SET it for this dedicated session).
begin;
create or replace function public.get_group_report_status_summary(_ws_id uuid)
returns table (
  group_id uuid,
  pending_count bigint,
  approved_count bigint,
  rejected_count bigint
)
language sql
stable
security definer
set search_path to public, private, pg_temp
as $$
  select
    r.group_id,
    count(*) filter (where r.report_approval_status = 'PENDING') as pending_count,
    count(*) filter (where r.report_approval_status = 'APPROVED') as approved_count,
    count(*) filter (where r.report_approval_status = 'REJECTED') as rejected_count
  from private.external_user_monthly_reports r
  join public.workspace_user_groups g on g.id = r.group_id
  where g.ws_id = _ws_id
  group by r.group_id;
$$;

create or replace function public.get_user_report_status_summary(
  _group_id uuid,
  _ws_id uuid
)
returns table (
  user_id uuid,
  pending_count bigint,
  approved_count bigint,
  rejected_count bigint
)
language sql
stable
security definer
set search_path to public, private, pg_temp
as $$
  select
    r.user_id,
    count(*) filter (where r.report_approval_status = 'PENDING') as pending_count,
    count(*) filter (where r.report_approval_status = 'APPROVED') as approved_count,
    count(*) filter (where r.report_approval_status = 'REJECTED') as rejected_count
  from private.external_user_monthly_reports r
  join public.workspace_user_groups g on g.id = r.group_id
  where r.group_id = _group_id
    and g.ws_id = _ws_id
  group by r.user_id;
$$;


do $rollback$
begin
  if current_setting('tuturuuu.restore_broken_notification_overloads',true) = 'on' then
    execute $restore$CREATE OR REPLACE FUNCTION public.get_or_create_notification_batch(p_ws_id uuid, p_user_id uuid, p_channel text, p_window_minutes integer DEFAULT 10)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_batch_id UUID;
    v_window_start TIMESTAMPTZ;
    v_window_end TIMESTAMPTZ;
BEGIN
    -- The function-level path above keeps pg_temp last.

    -- Try to find an existing pending batch within the window
    SELECT id INTO v_batch_id
    FROM public.notification_batches
    WHERE ws_id = p_ws_id
      AND user_id = p_user_id
      AND channel = p_channel
      AND status = 'pending'
      AND window_end > now()
    ORDER BY window_start DESC
    LIMIT 1;

    -- If no batch found, create a new one
    IF v_batch_id IS NULL THEN
        v_window_start := now();
        v_window_end := now() + (p_window_minutes || ' minutes')::interval;

        INSERT INTO public.notification_batches (
            ws_id,
            user_id,
            channel,
            window_start,
            window_end
        ) VALUES (
            p_ws_id,
            p_user_id,
            p_channel,
            v_window_start,
            v_window_end
        )
        RETURNING id INTO v_batch_id;
    END IF;

    RETURN v_batch_id;
END;
$function$
$restore$;
    revoke all on function public.get_or_create_notification_batch(uuid,uuid,text,integer) from public, anon, authenticated;
    grant execute on function public.get_or_create_notification_batch(uuid,uuid,text,integer) to service_role;
    execute $restore$CREATE OR REPLACE FUNCTION public.get_or_create_notification_batch(p_ws_id uuid, p_user_id uuid, p_channel text, p_window_minutes integer DEFAULT 10, p_email text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_batch_id UUID;
    v_window_start TIMESTAMPTZ;
    v_window_end TIMESTAMPTZ;
BEGIN
    -- Try to find an existing pending batch within the window
    -- Match by user_id if provided, otherwise by email
    IF p_user_id IS NOT NULL THEN
        SELECT id INTO v_batch_id
        FROM public.notification_batches
        WHERE (ws_id = p_ws_id OR (ws_id IS NULL AND p_ws_id IS NULL))
          AND user_id = p_user_id
          AND channel = p_channel
          AND status = 'pending'
          AND window_end > now()
        ORDER BY window_start DESC
        LIMIT 1;
    ELSIF p_email IS NOT NULL THEN
        SELECT id INTO v_batch_id
        FROM public.notification_batches
        WHERE (ws_id = p_ws_id OR (ws_id IS NULL AND p_ws_id IS NULL))
          AND email = p_email
          AND channel = p_channel
          AND status = 'pending'
          AND window_end > now()
        ORDER BY window_start DESC
        LIMIT 1;
    END IF;

    -- If no batch found, create a new one
    IF v_batch_id IS NULL THEN
        v_window_start := now();
        v_window_end := now() + (p_window_minutes || ' minutes')::interval;

        INSERT INTO public.notification_batches (
            ws_id,
            user_id,
            email,
            channel,
            window_start,
            window_end
        ) VALUES (
            p_ws_id,
            p_user_id,
            p_email,
            p_channel,
            v_window_start,
            v_window_end
        )
        RETURNING id INTO v_batch_id;
    END IF;

    RETURN v_batch_id;
END;
$function$
$restore$;
    revoke all on function public.get_or_create_notification_batch(uuid,uuid,text,integer,text) from public, anon, authenticated;
    grant execute on function public.get_or_create_notification_batch(uuid,uuid,text,integer,text) to service_role;
  end if;
end;
$rollback$;
commit;
