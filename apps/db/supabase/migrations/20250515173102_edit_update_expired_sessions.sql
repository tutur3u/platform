CREATE OR REPLACE FUNCTION public.update_expired_sessions()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  WITH expiration_time AS (
    SELECT 
      ns.id,
      CASE 
        WHEN nc.close_at IS NULL THEN ns.start_time + (nc.duration * interval '1 second')
        ELSE LEAST(ns.start_time + (nc.duration * interval '1 second'), nc.close_at)
      END AS exp_time
    FROM nova_sessions ns
    JOIN nova_challenges nc ON ns.challenge_id = nc.id
    WHERE ns.end_time IS NULL
    AND ns.status != 'ENDED'
  )
  UPDATE nova_sessions ns
  SET
    end_time = et.exp_time,
    status = 'ENDED'
  FROM expiration_time et
  WHERE ns.id = et.id
  AND et.exp_time <= now();
END;
$function$
;