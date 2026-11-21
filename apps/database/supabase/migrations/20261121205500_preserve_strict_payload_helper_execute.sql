BEGIN;

-- Invoker triggers call this helper during row writes. Preserve its existing ACL.
REVOKE ALL ON FUNCTION public.strict_payload_field_byte_limit(text, text)
  FROM PUBLIC, anon, authenticated;

-- tuturuuu: reviewed(function-grant): public.strict_payload_field_byte_limit(text,text) anon-required review=SR-20261121205500-invoker-acl
GRANT EXECUTE ON FUNCTION public.strict_payload_field_byte_limit(text, text)
  TO PUBLIC, anon, authenticated, service_role; -- allow-anon-grant: preserve existing caller access for invoker-triggered writes

COMMIT;
