-- Add module grouping for workspace course modules with stable ordering.

create table if not exists "public"."workspace_course_module_groups" (
  "id" uuid not null default gen_random_uuid(),
  "group_id" uuid not null,
  "title" text not null,
  "icon" text,
  "color" text,
  "sort_key" integer not null,
  "created_at" timestamp with time zone not null default now(),
  constraint "workspace_course_module_groups_pkey" primary key ("id"),
  constraint "workspace_course_module_groups_group_id_fkey"
    foreign key ("group_id")
    references "public"."workspace_user_groups"("id")
    on update cascade
    on delete cascade,
  constraint "workspace_course_module_groups_color_hex_check"
    check ("color" is null or "color" ~ '^#[0-9a-f]{6}$')
);

create unique index if not exists "idx_workspace_course_module_groups_group_sort_key"
  on "public"."workspace_course_module_groups" ("group_id", "sort_key");

create index if not exists "idx_workspace_course_module_groups_group_id"
  on "public"."workspace_course_module_groups" ("group_id");

alter table "public"."workspace_course_module_groups" enable row level security;

drop policy if exists "Allow all access for workspace member" on "public"."workspace_course_module_groups";

alter table "public"."workspace_course_modules"
  add column if not exists "module_group_id" uuid;

alter table "public"."workspace_course_modules"
  add constraint "workspace_course_modules_module_group_id_fkey"
  foreign key ("module_group_id")
  references "public"."workspace_course_module_groups"("id")
  on update cascade
  on delete cascade
  not valid;

insert into "public"."workspace_course_module_groups" (
  "group_id",
  "title",
  "sort_key"
)
select
  modules."group_id",
  'General',
  1
from (
  select distinct "group_id"
  from "public"."workspace_course_modules"
) as modules
left join "public"."workspace_course_module_groups" existing
  on existing."group_id" = modules."group_id"
 and existing."sort_key" = 1
where existing."id" is null;

with ranked_modules as (
  select
    modules."id" as module_id,
    default_groups."id" as module_group_id,
    row_number() over (
      partition by modules."group_id"
      order by
        coalesce(modules."sort_key", 2147483647),
        modules."created_at" asc,
        modules."id" asc
    )::integer as normalized_sort_key
  from "public"."workspace_course_modules" modules
  inner join "public"."workspace_course_module_groups" default_groups
    on default_groups."group_id" = modules."group_id"
   and default_groups."sort_key" = 1
)
update "public"."workspace_course_modules" modules
set
  "module_group_id" = ranked_modules."module_group_id",
  "sort_key" = ranked_modules."normalized_sort_key"
from ranked_modules
where modules."id" = ranked_modules.module_id;

do $$
begin
  if exists (
    select 1
    from "public"."workspace_course_modules"
    where "module_group_id" is null
  ) then
    raise exception 'workspace_course_modules.module_group_id backfill failed';
  end if;
end $$;

alter table "public"."workspace_course_modules"
  alter column "module_group_id" set not null;

alter table "public"."workspace_course_modules"
  alter column "sort_key" set not null;

drop index if exists "public"."idx_workspace_course_modules_group_sort_key";

create index if not exists "idx_workspace_course_modules_group_sort_key"
  on "public"."workspace_course_modules" ("group_id", "sort_key");

create unique index if not exists "idx_workspace_course_modules_module_group_sort_key"
  on "public"."workspace_course_modules" ("module_group_id", "sort_key");

alter table "public"."workspace_course_modules"
  validate constraint "workspace_course_modules_module_group_id_fkey";

create or replace function "public"."enforce_workspace_course_module_group_parent_match"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_group_id uuid;
begin
  select "group_id"
  into v_parent_group_id
  from "public"."workspace_course_module_groups"
  where "id" = new."module_group_id";

  if v_parent_group_id is null then
    raise exception 'workspace_course_modules.module_group_id references missing group';
  end if;

  if new."group_id" <> v_parent_group_id then
    raise exception 'workspace_course_modules.group_id must match workspace_course_module_groups.group_id';
  end if;

  return new;
end;
$$;

drop trigger if exists "trg_enforce_workspace_course_module_group_parent_match" on "public"."workspace_course_modules";
create trigger "trg_enforce_workspace_course_module_group_parent_match"
before insert or update of "group_id", "module_group_id"
on "public"."workspace_course_modules"
for each row
execute function "public"."enforce_workspace_course_module_group_parent_match"();

create or replace function "public"."reorder_workspace_course_module_groups"(
  "p_group_id" uuid,
  "p_module_group_ids" uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update "public"."workspace_course_module_groups" as module_groups
  set "sort_key" = ordered.position
  from (
    select module_group_id, ordinality::integer as position
    from unnest("p_module_group_ids") with ordinality as ordered(module_group_id, ordinality)
  ) as ordered
  where module_groups."id" = ordered.module_group_id
    and module_groups."group_id" = "p_group_id";
end;
$$;

grant execute on function "public"."reorder_workspace_course_module_groups"(uuid, uuid[]) to service_role;

create or replace function "public"."reorder_workspace_course_modules_in_module_group"(
  "p_module_group_id" uuid,
  "p_module_ids" uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update "public"."workspace_course_modules" as modules
  set "sort_key" = ordered.position
  from (
    select module_id, ordinality::integer as position
    from unnest("p_module_ids") with ordinality as ordered(module_id, ordinality)
  ) as ordered
  where modules."id" = ordered.module_id
    and modules."module_group_id" = "p_module_group_id";
end;
$$;

grant execute on function "public"."reorder_workspace_course_modules_in_module_group"(uuid, uuid[]) to service_role;

create or replace function "public"."reorder_workspace_course_modules"(
  "p_group_id" uuid,
  "p_module_ids" uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with ordered as (
    select module_id, ordinality::integer as position
    from unnest("p_module_ids") with ordinality as ordered(module_id, ordinality)
  ),
  ordered_with_groups as (
    select
      ordered.module_id,
      modules."module_group_id",
      ordered.position,
      row_number() over (
        partition by modules."module_group_id"
        order by ordered.position
      )::integer as position_in_module_group
    from ordered
    inner join "public"."workspace_course_modules" modules
      on modules."id" = ordered.module_id
    where modules."group_id" = "p_group_id"
  )
  update "public"."workspace_course_modules" as modules
  set "sort_key" = ordered_with_groups.position_in_module_group
  from ordered_with_groups
  where modules."id" = ordered_with_groups.module_id
    and modules."module_group_id" = ordered_with_groups."module_group_id";
end;
$$;

grant execute on function "public"."reorder_workspace_course_modules"(uuid, uuid[]) to service_role;
