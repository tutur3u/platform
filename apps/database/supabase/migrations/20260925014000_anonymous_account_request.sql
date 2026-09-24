-- PostgreSQL checks function privileges while preparing a boolean expression,
-- even when an earlier AND operand is false. Keep anonymous token exchanges
-- outside the account-only MFA expression without granting them the MFA probe.
CREATE OR REPLACE FUNCTION public.check_account_request()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF NOT public.account_required_mfa_satisfied() THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MFA verification required';
    END IF;
  END IF;
  PERFORM public.check_request();
END;
$$;
REVOKE ALL ON FUNCTION public.check_account_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_account_request() TO authenticator, anon, authenticated, service_role;
