-- Service-role REST writes have no auth.uid(). Finance attaches its verified
-- caller to an isolated admin client's requests, including linked row writes.
-- Regular authenticated/anonymous clients cannot supply an actor through headers.
create or replace function audit.resolve_actor_auth_uid()
returns uuid
language plpgsql stable set search_path = ''
as $function$
declare
  override_value text;
  header_actor text;
begin
  override_value := nullif(current_setting('audit.override_auth_uid', true), '');
  if override_value is not null then
    return override_value::uuid;
  end if;
  if auth.role() = 'service_role' then
    header_actor := nullif(current_setting('request.headers', true), '')::jsonb->>'x-ttr-audit-actor-id';
    if header_actor is not null then
      return header_actor::uuid;
    end if;
  end if;
  return auth.uid();
exception when others then
  return auth.uid();
end;
$function$;
