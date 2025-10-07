-- Fix check_guest_lead_generation_conditions to not reference non-existent user_group_attendance.ws_id
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_guest_lead_generation_conditions()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  is_guest_user BOOLEAN;
  attendance_threshold SMALLINT;
  attendance_count INTEGER;
BEGIN
  -- Check 1: Verify the user is a guest
  SELECT public.is_user_guest(NEW.user_id) INTO is_guest_user;

  IF COALESCE(is_guest_user, FALSE) = FALSE THEN
    RAISE EXCEPTION 'Cannot create lead generation record: User is not a guest.';
  END IF;

  -- Check 2: Verify attendance meets the workspace's minimum threshold
  SELECT ws.guest_user_checkup_threshold
  INTO attendance_threshold
  FROM public.workspace_settings ws
  WHERE ws.ws_id = NEW.ws_id;

  IF attendance_threshold IS NULL THEN
      RAISE EXCEPTION 'Cannot create lead generation record: Attendance threshold is not set for this workspace.';
  END IF;

  -- Calculate the raw count of PRESENT or LATE sessions for this user within the workspace
  SELECT COUNT(*)
  INTO attendance_count
  FROM public.user_group_attendance uga
  JOIN public.workspace_user_groups gug ON gug.id = uga.group_id
  WHERE uga.user_id = NEW.user_id
    AND gug.ws_id = NEW.ws_id
    AND uga.status IN ('PRESENT', 'LATE');

  -- Block the insert if attendance is BELOW the minimum required threshold
  IF attendance_count < attendance_threshold THEN
    RAISE EXCEPTION 'Cannot create lead generation record: User attendance count (%) does not meet the minimum required threshold of %.', attendance_count, attendance_threshold;
  END IF;

  -- All checks passed, allow the INSERT operation to proceed
  RETURN NEW;
END;
$function$;


