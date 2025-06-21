set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_expired_sessions()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE nova_sessions ns
  SET
    end_time = ns.start_time + (nc.duration * interval '1 second'),
    status = 'ENDED'
  FROM nova_challenges nc
  WHERE ns.challenge_id = nc.id
  AND ns.start_time + (nc.duration * interval '1 second') <= now()
  AND ns.status != 'ENDED';
END;
$function$
;

SELECT cron.schedule(
  'update_expired_sessions_job',
  '* * * * *',
  'SELECT public.update_expired_sessions();'
);
