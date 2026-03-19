ALTER TYPE public.abuse_event_type
ADD VALUE IF NOT EXISTS 'otp_limit_reset';
