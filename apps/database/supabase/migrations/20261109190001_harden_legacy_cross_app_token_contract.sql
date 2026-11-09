begin;

create or replace function public.validate_cross_app_token(
  p_token text,
  p_target_app text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user_id uuid;
begin
  update private.cross_app_tokens as token_row
  set used_at = pg_catalog.now()
  where token_row.token = p_token
    and token_row.target_app = p_target_app
    and token_row.expires_at > pg_catalog.now()
    and token_row.used_at is null
    and token_row.is_revoked = false
    and token_row.code_challenge is null
    and token_row.code_challenge_method is null
  returning token_row.user_id into v_user_id;

  if not found then
    return null;
  end if;

  return v_user_id;
end;
$$;

revoke all on function public.validate_cross_app_token(text, text)
  from public, anon, authenticated, service_role;

-- tuturuuu: reviewed(function-grant): public.validate_cross_app_token(text,text) review=https://github.com/tutur3u/platform/pull/7857#pullrequestreview-5819793309
grant execute on function public.validate_cross_app_token(text, text)
  to authenticated, service_role;

commit;
