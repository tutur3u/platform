do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_group_attendance_member_fkey'
      and conrelid = 'public.user_group_attendance'::regclass
  ) then
    alter table public.user_group_attendance
      add constraint user_group_attendance_member_fkey
      foreign key (user_id, group_id)
      references public.workspace_user_groups_users (user_id, group_id)
      on update cascade
      on delete cascade
      not valid;
  end if;
end;
$$;

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
  select count(distinct group_member."user_id")::integer
  into valid_user_count
  from input_values
  join "public"."workspace_users" workspace_user
    on workspace_user."id" = input_values."user_id"
   and workspace_user."ws_id" = p_ws_id
  join "public"."workspace_user_groups_users" group_member
    on group_member."user_id" = workspace_user."id"
   and group_member."group_id" = p_group_id;

  if valid_user_count <> input_count then
    raise exception 'invalid_attendance_group_member' using errcode = '22023';
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

revoke all on function "private"."admin_save_user_group_attendance_with_audit_actor"(uuid, uuid, date, jsonb, uuid) from public, anon, authenticated;
grant execute on function "private"."admin_save_user_group_attendance_with_audit_actor"(uuid, uuid, date, jsonb, uuid) to service_role;
