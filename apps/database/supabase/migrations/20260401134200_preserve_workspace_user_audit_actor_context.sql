create or replace function audit.resolve_actor_auth_uid()
returns uuid
language plpgsql
stable
as $function$
declare
  override_value text;
begin
  override_value := nullif(current_setting('audit.override_auth_uid', true), '');

  if override_value is not null then
    return override_value::uuid;
  end if;

  return auth.uid();
exception
  when others then
    return auth.uid();
end;
$function$;

create or replace function audit.insert_update_delete_trigger()
returns trigger
security definer
language plpgsql
as $function$
declare
  pkey_cols text[] = audit.primary_key_columns(TG_RELID);
  record_jsonb jsonb = to_jsonb(new);
  record_id uuid = audit.to_record_id(TG_RELID, pkey_cols, record_jsonb);
  old_record_jsonb jsonb = to_jsonb(old);
  old_record_id uuid = audit.to_record_id(TG_RELID, pkey_cols, old_record_jsonb);
  actor_auth_uid uuid = audit.resolve_actor_auth_uid();
begin
  insert into audit.record_version(
    record_id,
    old_record_id,
    op,
    table_oid,
    table_schema,
    table_name,
    record,
    old_record,
    auth_uid
  )
  select
    record_id,
    old_record_id,
    TG_OP::audit.operation,
    TG_RELID,
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    record_jsonb,
    old_record_jsonb,
    actor_auth_uid;

  return coalesce(new, old);
end;
$function$;

create or replace function public.admin_create_workspace_user_with_audit_actor(
  p_ws_id uuid,
  p_payload jsonb,
  p_actor_auth_uid uuid default null
)
returns public.workspace_users
language plpgsql
security definer
set search_path = public, audit
as $function$
declare
  payload public.workspace_users;
  created_row public.workspace_users;
begin
  payload := jsonb_populate_record(null::public.workspace_users, coalesce(p_payload, '{}'::jsonb));

  perform set_config(
    'audit.override_auth_uid',
    coalesce(p_actor_auth_uid::text, ''),
    true
  );

  insert into public.workspace_users (
    id,
    full_name,
    email,
    phone,
    birthday,
    gender,
    ethnicity,
    guardian,
    address,
    national_id,
    note,
    ws_id,
    avatar_url,
    display_name,
    archived,
    archived_until
  )
  values (
    coalesce(payload.id, gen_random_uuid()),
    payload.full_name,
    payload.email,
    payload.phone,
    payload.birthday,
    payload.gender,
    payload.ethnicity,
    payload.guardian,
    payload.address,
    payload.national_id,
    payload.note,
    p_ws_id,
    payload.avatar_url,
    payload.display_name,
    coalesce(payload.archived, false),
    payload.archived_until
  )
  returning * into created_row;

  return created_row;
end;
$function$;

create or replace function public.admin_update_workspace_user_with_audit_actor(
  p_ws_id uuid,
  p_user_id uuid,
  p_payload jsonb,
  p_actor_auth_uid uuid default null
)
returns public.workspace_users
language plpgsql
security definer
set search_path = public, audit
as $function$
declare
  payload public.workspace_users;
  updated_row public.workspace_users;
begin
  payload := jsonb_populate_record(null::public.workspace_users, coalesce(p_payload, '{}'::jsonb));

  perform set_config(
    'audit.override_auth_uid',
    coalesce(p_actor_auth_uid::text, ''),
    true
  );

  update public.workspace_users as workspace_user
  set
    id = case when p_payload ? 'id' then payload.id else workspace_user.id end,
    full_name = case when p_payload ? 'full_name' then payload.full_name else workspace_user.full_name end,
    email = case when p_payload ? 'email' then payload.email else workspace_user.email end,
    phone = case when p_payload ? 'phone' then payload.phone else workspace_user.phone end,
    birthday = case when p_payload ? 'birthday' then payload.birthday else workspace_user.birthday end,
    gender = case when p_payload ? 'gender' then payload.gender else workspace_user.gender end,
    ethnicity = case when p_payload ? 'ethnicity' then payload.ethnicity else workspace_user.ethnicity end,
    guardian = case when p_payload ? 'guardian' then payload.guardian else workspace_user.guardian end,
    address = case when p_payload ? 'address' then payload.address else workspace_user.address end,
    national_id = case when p_payload ? 'national_id' then payload.national_id else workspace_user.national_id end,
    note = case when p_payload ? 'note' then payload.note else workspace_user.note end,
    avatar_url = case when p_payload ? 'avatar_url' then payload.avatar_url else workspace_user.avatar_url end,
    display_name = case when p_payload ? 'display_name' then payload.display_name else workspace_user.display_name end,
    archived = case when p_payload ? 'archived' then coalesce(payload.archived, false) else workspace_user.archived end,
    archived_until = case when p_payload ? 'archived_until' then payload.archived_until else workspace_user.archived_until end,
    updated_at = now()
  where workspace_user.ws_id = p_ws_id
    and workspace_user.id = p_user_id
  returning * into updated_row;

  return updated_row;
end;
$function$;

create or replace function public.admin_delete_workspace_user_with_audit_actor(
  p_ws_id uuid,
  p_user_id uuid,
  p_actor_auth_uid uuid default null
)
returns public.workspace_users
language plpgsql
security definer
set search_path = public, audit
as $function$
declare
  deleted_row public.workspace_users;
begin
  perform set_config(
    'audit.override_auth_uid',
    coalesce(p_actor_auth_uid::text, ''),
    true
  );

  delete from public.workspace_users
  where ws_id = p_ws_id
    and id = p_user_id
  returning * into deleted_row;

  return deleted_row;
end;
$function$;
