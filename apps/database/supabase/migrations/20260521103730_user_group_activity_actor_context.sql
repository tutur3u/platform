create or replace function "private"."ensure_user_group_metric_category_ids"(
  p_ws_id uuid,
  p_category_ids uuid[] default null
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $function$
declare
  unique_category_ids uuid[];
  valid_category_count integer;
begin
  select coalesce(array_agg(distinct category_id), array[]::uuid[])
  into unique_category_ids
  from unnest(coalesce(p_category_ids, array[]::uuid[])) as category_ids(category_id);

  if cardinality(unique_category_ids) = 0 then
    return unique_category_ids;
  end if;

  select count(*)::integer
  into valid_category_count
  from "public"."user_group_metric_categories" category
  where category."ws_id" = p_ws_id
    and category."id" = any(unique_category_ids);

  if valid_category_count <> cardinality(unique_category_ids) then
    raise exception 'invalid_metric_category' using errcode = '22023';
  end if;

  return unique_category_ids;
end;
$function$;

create or replace function "private"."admin_create_user_group_metric_with_audit_actor"(
  p_ws_id uuid,
  p_group_id uuid,
  p_payload jsonb,
  p_category_ids uuid[] default null,
  p_actor_auth_uid uuid default null
)
returns "public"."user_group_metrics"
language plpgsql
security definer
set search_path = public, audit, private
as $function$
declare
  payload "public"."user_group_metrics";
  created_row "public"."user_group_metrics";
  valid_category_ids uuid[];
begin
  if not exists (
    select 1
    from "public"."workspace_user_groups" workspace_group
    where workspace_group."id" = p_group_id
      and workspace_group."ws_id" = p_ws_id
  ) then
    return null;
  end if;

  valid_category_ids := private.ensure_user_group_metric_category_ids(
    p_ws_id,
    p_category_ids
  );
  payload := jsonb_populate_record(null::"public"."user_group_metrics", coalesce(p_payload, '{}'::jsonb));

  perform set_config('audit.override_auth_uid', coalesce(p_actor_auth_uid::text, ''), true);

  insert into "public"."user_group_metrics" (
    "id",
    "name",
    "unit",
    "factor",
    "is_weighted",
    "ws_id",
    "group_id"
  )
  values (
    coalesce(payload."id", gen_random_uuid()),
    payload."name",
    coalesce(payload."unit", ''),
    coalesce(payload."factor", 1),
    coalesce(payload."is_weighted", true),
    p_ws_id,
    p_group_id
  )
  returning * into created_row;

  if cardinality(valid_category_ids) > 0 then
    insert into "public"."user_group_metric_category_links" (
      "category_id",
      "metric_id"
    )
    select category_id, created_row."id"
    from unnest(valid_category_ids) as category_ids(category_id);
  end if;

  return created_row;
end;
$function$;

create or replace function "private"."admin_update_user_group_metric_with_audit_actor"(
  p_ws_id uuid,
  p_metric_id uuid,
  p_payload jsonb,
  p_category_ids uuid[] default null,
  p_actor_auth_uid uuid default null
)
returns "public"."user_group_metrics"
language plpgsql
security definer
set search_path = public, audit, private
as $function$
declare
  payload "public"."user_group_metrics";
  updated_row "public"."user_group_metrics";
  valid_category_ids uuid[];
begin
  if p_category_ids is not null then
    valid_category_ids := private.ensure_user_group_metric_category_ids(
      p_ws_id,
      p_category_ids
    );
  end if;

  payload := jsonb_populate_record(null::"public"."user_group_metrics", coalesce(p_payload, '{}'::jsonb));

  perform set_config('audit.override_auth_uid', coalesce(p_actor_auth_uid::text, ''), true);

  update "public"."user_group_metrics" as metric
  set
    "name" = case when p_payload ? 'name' then payload."name" else metric."name" end,
    "factor" = case when p_payload ? 'factor' then coalesce(payload."factor", metric."factor") else metric."factor" end,
    "unit" = case when p_payload ? 'unit' then coalesce(payload."unit", '') else metric."unit" end,
    "is_weighted" = case when p_payload ? 'is_weighted' then coalesce(payload."is_weighted", true) else metric."is_weighted" end,
    "group_id" = case when p_payload ? 'group_id' then payload."group_id" else metric."group_id" end
  where metric."ws_id" = p_ws_id
    and metric."id" = p_metric_id
  returning * into updated_row;

  if updated_row."id" is null then
    return null;
  end if;

  if p_category_ids is not null then
    delete from "public"."user_group_metric_category_links"
    where "metric_id" = p_metric_id;

    if cardinality(valid_category_ids) > 0 then
      insert into "public"."user_group_metric_category_links" (
        "category_id",
        "metric_id"
      )
      select category_id, p_metric_id
      from unnest(valid_category_ids) as category_ids(category_id);
    end if;
  end if;

  return updated_row;
end;
$function$;

create or replace function "private"."admin_upsert_user_indicator_values_with_audit_actor"(
  p_ws_id uuid,
  p_group_id uuid,
  p_values jsonb,
  p_actor_auth_uid uuid default null
)
returns setof "public"."user_indicators"
language plpgsql
security definer
set search_path = public, audit, private
as $function$
declare
  actor_workspace_user_id uuid;
  input_count integer;
  valid_input_count integer;
begin
  if not exists (
    select 1
    from "public"."workspace_user_groups" workspace_group
    where workspace_group."id" = p_group_id
      and workspace_group."ws_id" = p_ws_id
  ) then
    return;
  end if;

  select linked_user."virtual_user_id"
  into actor_workspace_user_id
  from "public"."workspace_user_linked_users" linked_user
  where linked_user."ws_id" = p_ws_id
    and linked_user."platform_user_id" = p_actor_auth_uid
  limit 1;

  with input_values as (
    select *
    from jsonb_to_recordset(coalesce(p_values, '[]'::jsonb)) as value_row(
      "user_id" uuid,
      "indicator_id" uuid,
      "value" numeric
    )
  )
  select count(*)::integer
  into input_count
  from input_values;

  if input_count = 0 then
    return;
  end if;

  with input_values as (
    select *
    from jsonb_to_recordset(coalesce(p_values, '[]'::jsonb)) as value_row(
      "user_id" uuid,
      "indicator_id" uuid,
      "value" numeric
    )
  )
  select count(*)::integer
  into valid_input_count
  from input_values
  join "public"."workspace_users" workspace_user
    on workspace_user."id" = input_values."user_id"
   and workspace_user."ws_id" = p_ws_id
  join "public"."user_group_metrics" metric
    on metric."id" = input_values."indicator_id"
   and metric."ws_id" = p_ws_id
   and metric."group_id" = p_group_id;

  if valid_input_count <> input_count then
    raise exception 'invalid_user_indicator_target' using errcode = '22023';
  end if;

  perform set_config('audit.override_auth_uid', coalesce(p_actor_auth_uid::text, ''), true);

  return query
  with input_values as (
    select *
    from jsonb_to_recordset(coalesce(p_values, '[]'::jsonb)) as value_row(
      "user_id" uuid,
      "indicator_id" uuid,
      "value" numeric
    )
  )
  insert into "public"."user_indicators" (
    "user_id",
    "indicator_id",
    "value",
    "creator_id"
  )
  select
    input_values."user_id",
    input_values."indicator_id",
    input_values."value",
    actor_workspace_user_id
  from input_values
  on conflict ("user_id", "indicator_id")
  do update set
    "value" = excluded."value"
  returning *;
end;
$function$;

create or replace function "private"."admin_save_user_group_attendance_with_audit_actor"(
  p_ws_id uuid,
  p_group_id uuid,
  p_date date,
  p_payload jsonb,
  p_actor_auth_uid uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, audit, private
as $function$
declare
  input_count integer;
  valid_user_count integer;
begin
  if not exists (
    select 1
    from "public"."workspace_user_groups" workspace_group
    where workspace_group."id" = p_group_id
      and workspace_group."ws_id" = p_ws_id
  ) then
    raise exception 'user_group_not_found' using errcode = 'P0002';
  end if;

  with input_values as (
    select *
    from jsonb_to_recordset(coalesce(p_payload, '[]'::jsonb)) as value_row(
      "user_id" uuid,
      "status" text,
      "date" date,
      "notes" text
    )
  )
  select count(distinct input_values."user_id")::integer
  into input_count
  from input_values;

  with input_values as (
    select *
    from jsonb_to_recordset(coalesce(p_payload, '[]'::jsonb)) as value_row(
      "user_id" uuid,
      "status" text,
      "date" date,
      "notes" text
    )
  )
  select count(distinct workspace_user."id")::integer
  into valid_user_count
  from input_values
  join "public"."workspace_users" workspace_user
    on workspace_user."id" = input_values."user_id"
   and workspace_user."ws_id" = p_ws_id;

  if valid_user_count <> input_count then
    raise exception 'invalid_attendance_user' using errcode = '22023';
  end if;

  perform set_config('audit.override_auth_uid', coalesce(p_actor_auth_uid::text, ''), true);

  delete from "public"."user_group_attendance" attendance
  using (
    select distinct input_values."user_id"
    from jsonb_to_recordset(coalesce(p_payload, '[]'::jsonb)) as input_values(
      "user_id" uuid,
      "status" text,
      "date" date,
      "notes" text
    )
    where input_values."status" = 'NONE'
  ) as delete_values
  where attendance."group_id" = p_group_id
    and attendance."date" = p_date
    and attendance."user_id" = delete_values."user_id";

  insert into "public"."user_group_attendance" (
    "group_id",
    "date",
    "user_id",
    "status",
    "notes"
  )
  select
    p_group_id,
    p_date,
    input_values."user_id",
    input_values."status",
    coalesce(input_values."notes", '')
  from jsonb_to_recordset(coalesce(p_payload, '[]'::jsonb)) as input_values(
    "user_id" uuid,
    "status" text,
    "date" date,
    "notes" text
  )
  where input_values."status" <> 'NONE'
  on conflict ("group_id", "date", "user_id")
  do update set
    "status" = excluded."status",
    "notes" = excluded."notes";
end;
$function$;

revoke all on function "private"."ensure_user_group_metric_category_ids"(uuid, uuid[]) from public, anon, authenticated;
revoke all on function "private"."admin_create_user_group_metric_with_audit_actor"(uuid, uuid, jsonb, uuid[], uuid) from public, anon, authenticated;
revoke all on function "private"."admin_update_user_group_metric_with_audit_actor"(uuid, uuid, jsonb, uuid[], uuid) from public, anon, authenticated;
revoke all on function "private"."admin_upsert_user_indicator_values_with_audit_actor"(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function "private"."admin_save_user_group_attendance_with_audit_actor"(uuid, uuid, date, jsonb, uuid) from public, anon, authenticated;

grant execute on function "private"."ensure_user_group_metric_category_ids"(uuid, uuid[]) to service_role;
grant execute on function "private"."admin_create_user_group_metric_with_audit_actor"(uuid, uuid, jsonb, uuid[], uuid) to service_role;
grant execute on function "private"."admin_update_user_group_metric_with_audit_actor"(uuid, uuid, jsonb, uuid[], uuid) to service_role;
grant execute on function "private"."admin_upsert_user_indicator_values_with_audit_actor"(uuid, uuid, jsonb, uuid) to service_role;
grant execute on function "private"."admin_save_user_group_attendance_with_audit_actor"(uuid, uuid, date, jsonb, uuid) to service_role;
