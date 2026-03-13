ALTER TABLE public.abuse_events
ADD COLUMN email TEXT;

COMMENT ON COLUMN public.abuse_events.email IS
'Normalized target email for internal abuse-event observability';
