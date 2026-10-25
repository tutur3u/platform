-- Keep catalog types ahead of temporary types in this SECURITY DEFINER trigger.
alter function public.check_challenge_attempt_limits()
  set search_path = pg_catalog, pg_temp;
