CREATE OR REPLACE FUNCTION public.update_expired_sessions()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE nova_sessions ns
  SET
    end_time = (
      SELECT 
        CASE 
          WHEN nc.close_at IS NULL THEN ns.start_time + (nc.duration * interval '1 second')
          ELSE LEAST(ns.start_time + (nc.duration * interval '1 second'), nc.close_at)
        END
    ),
    status = 'ENDED'
  FROM nova_challenges nc
  WHERE ns.challenge_id = nc.id
  AND ns.start_time + (nc.duration * interval '1 second') <= now()
  AND ns.status != 'ENDED';
END;
$function$
;