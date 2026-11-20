begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Only the two new functions are removed. The serialized plan writer, the
-- owner-run claim, acknowledgement and advance functions, and the advance
-- that never cancels a pending intent stay: restoring the earlier versions
-- would bring back a lost first write, failed claims under service_role, and
-- cancellation of intents whose delete outcome is unknown.
drop function if exists private.cancel_meet_attendance_intent(text, text, text);
drop function if exists private.finish_meet_attendance_intent(text, text);

notify pgrst, 'reload schema';
commit;
