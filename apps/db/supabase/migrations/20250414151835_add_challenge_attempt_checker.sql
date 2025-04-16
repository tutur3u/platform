drop policy "Users can create sessions if within attempt limits or are chall" on "public"."nova_sessions";

drop policy "Users can read their own sessions or challenge managers can rea" on "public"."nova_sessions";

drop policy "Users can update their own sessions" on "public"."nova_sessions";

drop function if exists "public"."check_challenge_attempt_limits"(_challenge_id uuid, _user_id uuid);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_challenge_attempt_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$DECLARE
  challenge_max_attempts smallint;
  challenge_max_daily_attempts smallint;
  total_attempts bigint;
  daily_attempts bigint;
BEGIN
  SELECT
    nc.max_attempts,
    nc.max_daily_attempts,
    COUNT(ns.id) FILTER (WHERE ns.user_id = NEW.user_id),
    COUNT(ns.id) FILTER (WHERE ns.user_id = NEW.user_id AND ns.created_at::date = current_date)
  INTO
    challenge_max_attempts,
    challenge_max_daily_attempts,
    total_attempts,
    daily_attempts
  FROM nova_challenges nc
  LEFT JOIN nova_sessions ns ON nc.id = ns.challenge_id
  WHERE nc.id = NEW.challenge_id
  GROUP BY nc.max_attempts, nc.max_daily_attempts;

  challenge_max_attempts := COALESCE(challenge_max_attempts, 32767);
  challenge_max_daily_attempts := COALESCE(challenge_max_daily_attempts, 32767);
  total_attempts := COALESCE(total_attempts, 0);
  daily_attempts := COALESCE(daily_attempts, 0);

  IF total_attempts >= challenge_max_attempts THEN
    RAISE EXCEPTION 'You have exceeded the maximum number of total attempts for this challenge.';
  ELSIF daily_attempts >= challenge_max_daily_attempts THEN
    RAISE EXCEPTION 'You have exceeded the daily attempt limit for this challenge.';
  END IF;

  RETURN NEW;
END$function$
;

create policy "Enable all access for current user"
on "public"."nova_sessions"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


CREATE TRIGGER check_challenge_attempt_limits BEFORE INSERT ON public.nova_sessions FOR EACH ROW EXECUTE FUNCTION check_challenge_attempt_limits();


