ALTER TYPE "public"."external_project_adapter_kind"
ADD VALUE IF NOT EXISTS 'cms_site';

create or replace function private.external_project_set_cms_site_template(
  p_ws_id uuid,
  p_template jsonb,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_settings jsonb;
begin
  if p_template is null or jsonb_typeof(p_template) <> 'object' then
    raise exception 'external_project_invalid_template';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text, 0));
  update public.workspace_external_project_bindings
  set settings = jsonb_set(
        coalesce(settings, '{}'::jsonb),
        '{cmsSite}',
        case
          when jsonb_typeof(settings->'cmsSite') = 'object'
            then settings->'cmsSite'
          else '{}'::jsonb
        end
          || jsonb_build_object('template', p_template),
        true
      ),
      updated_by = p_actor_user_id
  where ws_id = p_ws_id
  returning settings into v_settings;

  if not found then
    raise exception 'external_project_binding_not_found';
  end if;
  return v_settings;
end;
$$;

revoke all on function private.external_project_set_cms_site_template(uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function private.external_project_set_cms_site_template(uuid, jsonb, uuid)
  to service_role;
