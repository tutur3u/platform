do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'workspace_guest_permission_t'
  ) then
    create type "public"."workspace_guest_permission_t" as enum (
      'course:view',
      'course:complete'
    );
  end if;
end $$;

create table if not exists "public"."workspace_guests" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "ws_id" uuid not null,
    "user_id" uuid not null,
    constraint "workspace_guests_pkey" primary key ("id"),
    constraint "workspace_guests_ws_id_user_id_key" unique ("ws_id", "user_id")
);

alter table "public"."workspace_guests" enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_guests_ws_id_fkey'
      and conrelid = 'public.workspace_guests'::regclass
  ) then
    alter table "public"."workspace_guests"
      add constraint "workspace_guests_ws_id_fkey"
      foreign key (ws_id) references workspaces(id)
      on update cascade
      on delete cascade
      not valid;
  end if;
end $$;

alter table "public"."workspace_guests"
  validate constraint "workspace_guests_ws_id_fkey";

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_guests_user_id_fkey'
      and conrelid = 'public.workspace_guests'::regclass
  ) then
    alter table "public"."workspace_guests"
      add constraint "workspace_guests_user_id_fkey"
      foreign key (user_id) references users(id)
      on update cascade
      on delete cascade
      not valid;
  end if;
end $$;

alter table "public"."workspace_guests"
  validate constraint "workspace_guests_user_id_fkey";

create index if not exists "workspace_guests_ws_id_idx"
  on "public"."workspace_guests" using btree (ws_id);

create index if not exists "workspace_guests_user_id_idx"
  on "public"."workspace_guests" using btree (user_id);

grant delete on table "public"."workspace_guests" to "authenticated";
grant insert on table "public"."workspace_guests" to "authenticated";
grant select on table "public"."workspace_guests" to "authenticated";
grant update on table "public"."workspace_guests" to "authenticated";

grant delete on table "public"."workspace_guests" to "service_role";
grant insert on table "public"."workspace_guests" to "service_role";
grant select on table "public"."workspace_guests" to "service_role";
grant update on table "public"."workspace_guests" to "service_role";

create table if not exists "public"."workspace_guest_permissions" (
    "id" uuid not null default gen_random_uuid(),
    "guest_id" uuid not null,
    "permission" "public"."workspace_guest_permission_t" not null,
    "enable" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "resource_id" uuid,
    constraint "workspace_guest_permissions_pkey" primary key ("id")
);

alter table "public"."workspace_guest_permissions" enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_guest_permissions_guest_id_fkey'
      and conrelid = 'public.workspace_guest_permissions'::regclass
  ) then
    alter table "public"."workspace_guest_permissions"
      add constraint "workspace_guest_permissions_guest_id_fkey"
      foreign key (guest_id) references workspace_guests(id)
      on update cascade
      on delete cascade
      not valid;
  end if;
end $$;

alter table "public"."workspace_guest_permissions"
  validate constraint "workspace_guest_permissions_guest_id_fkey";

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_guest_permissions_resource_id_fkey'
      and conrelid = 'public.workspace_guest_permissions'::regclass
  ) then
    alter table "public"."workspace_guest_permissions"
      add constraint "workspace_guest_permissions_resource_id_fkey"
      foreign key (resource_id) references "public"."workspace_user_groups"(id)
      on update cascade
      on delete cascade
      not valid;
  end if;
end $$;

alter table "public"."workspace_guest_permissions"
  validate constraint "workspace_guest_permissions_resource_id_fkey";

create index if not exists "workspace_guest_permissions_guest_id_idx"
  on "public"."workspace_guest_permissions" using btree (guest_id);

create unique index if not exists "ux_workspace_guest_perm_global"
  on "public"."workspace_guest_permissions" using btree (guest_id, permission)
  where resource_id is null;

create unique index if not exists "ux_workspace_guest_perm_resource"
  on "public"."workspace_guest_permissions" using btree (guest_id, permission, resource_id)
  where resource_id is not null;

grant delete on table "public"."workspace_guest_permissions" to "authenticated";
grant insert on table "public"."workspace_guest_permissions" to "authenticated";
grant select on table "public"."workspace_guest_permissions" to "authenticated";
grant update on table "public"."workspace_guest_permissions" to "authenticated";

grant delete on table "public"."workspace_guest_permissions" to "service_role";
grant insert on table "public"."workspace_guest_permissions" to "service_role";
grant select on table "public"."workspace_guest_permissions" to "service_role";
grant update on table "public"."workspace_guest_permissions" to "service_role";

drop policy if exists "Workspace members can manage workspace guests"
on "public"."workspace_guests";

drop policy if exists "Workspace members can view workspace guests"
on "public"."workspace_guests";

drop policy if exists "Workspace members can create workspace guests"
on "public"."workspace_guests";

drop policy if exists "Workspace members can update workspace guests"
on "public"."workspace_guests";

drop policy if exists "Workspace members can delete workspace guests"
on "public"."workspace_guests";

create policy "Workspace members can view workspace guests"
on "public"."workspace_guests"
as permissive
for select
to authenticated
using (is_org_member(auth.uid(), ws_id));

create policy "Workspace members can create workspace guests"
on "public"."workspace_guests"
as permissive
for insert
to authenticated
with check (
  ws_id in (
    select wrp.ws_id
    from workspace_role_members wrm
    join workspace_role_permissions wrp
      on wrp.role_id = wrm.role_id
     and wrp.ws_id = "workspace_guests".ws_id
    where wrm.user_id = auth.uid()
      and wrp.permission = 'manage_workspace_members'
      and wrp.enabled = true

    union

    select wdp.ws_id
    from workspace_default_permissions wdp
    where wdp.ws_id = "workspace_guests".ws_id
      and wdp.permission = 'manage_workspace_members'
      and wdp.enabled = true
      and exists (
        select 1
        from workspace_members wm
        where wm.ws_id = "workspace_guests".ws_id
          and wm.user_id = auth.uid()
      )
  )
);

create policy "Workspace members can update workspace guests"
on "public"."workspace_guests"
as permissive
for update
to authenticated
using (
  ws_id in (
    select wrp.ws_id
    from workspace_role_members wrm
    join workspace_role_permissions wrp
      on wrp.role_id = wrm.role_id
     and wrp.ws_id = "workspace_guests".ws_id
    where wrm.user_id = auth.uid()
      and wrp.permission = 'manage_workspace_members'
      and wrp.enabled = true

    union

    select wdp.ws_id
    from workspace_default_permissions wdp
    where wdp.ws_id = "workspace_guests".ws_id
      and wdp.permission = 'manage_workspace_members'
      and wdp.enabled = true
      and exists (
        select 1
        from workspace_members wm
        where wm.ws_id = "workspace_guests".ws_id
          and wm.user_id = auth.uid()
      )
  )
)
with check (
  ws_id in (
    select wrp.ws_id
    from workspace_role_members wrm
    join workspace_role_permissions wrp
      on wrp.role_id = wrm.role_id
     and wrp.ws_id = "workspace_guests".ws_id
    where wrm.user_id = auth.uid()
      and wrp.permission = 'manage_workspace_members'
      and wrp.enabled = true

    union

    select wdp.ws_id
    from workspace_default_permissions wdp
    where wdp.ws_id = "workspace_guests".ws_id
      and wdp.permission = 'manage_workspace_members'
      and wdp.enabled = true
      and exists (
        select 1
        from workspace_members wm
        where wm.ws_id = "workspace_guests".ws_id
          and wm.user_id = auth.uid()
      )
  )
);

create policy "Workspace members can delete workspace guests"
on "public"."workspace_guests"
as permissive
for delete
to authenticated
using (
  ws_id in (
    select wrp.ws_id
    from workspace_role_members wrm
    join workspace_role_permissions wrp
      on wrp.role_id = wrm.role_id
     and wrp.ws_id = "workspace_guests".ws_id
    where wrm.user_id = auth.uid()
      and wrp.permission = 'manage_workspace_members'
      and wrp.enabled = true

    union

    select wdp.ws_id
    from workspace_default_permissions wdp
    where wdp.ws_id = "workspace_guests".ws_id
      and wdp.permission = 'manage_workspace_members'
      and wdp.enabled = true
      and exists (
        select 1
        from workspace_members wm
        where wm.ws_id = "workspace_guests".ws_id
          and wm.user_id = auth.uid()
      )
  )
);

drop policy if exists "Workspace members can manage workspace guest permissions"
on "public"."workspace_guest_permissions";

drop policy if exists "Workspace members can view workspace guest permissions"
on "public"."workspace_guest_permissions";

drop policy if exists "Workspace members can create workspace guest permissions"
on "public"."workspace_guest_permissions";

drop policy if exists "Workspace members can update workspace guest permissions"
on "public"."workspace_guest_permissions";

drop policy if exists "Workspace members can delete workspace guest permissions"
on "public"."workspace_guest_permissions";

create policy "Workspace members can view workspace guest permissions"
on "public"."workspace_guest_permissions"
as permissive
for select
to authenticated
using (
  exists (
    select 1
    from "public"."workspace_guests" wg
    where wg.id = "workspace_guest_permissions"."guest_id"
      and is_org_member(auth.uid(), wg.ws_id)
  )
);

create policy "Workspace members can create workspace guest permissions"
on "public"."workspace_guest_permissions"
as permissive
for insert
to authenticated
with check (
  exists (
    select 1
    from "public"."workspace_guests" wg
    where wg.id = "workspace_guest_permissions"."guest_id"
      and wg.ws_id in (
        select wrp.ws_id
        from workspace_role_members wrm
        join workspace_role_permissions wrp
          on wrp.role_id = wrm.role_id
         and wrp.ws_id = wg.ws_id
        where wrm.user_id = auth.uid()
          and wrp.permission = 'manage_workspace_members'
          and wrp.enabled = true

        union

        select wdp.ws_id
        from workspace_default_permissions wdp
        where wdp.ws_id = wg.ws_id
          and wdp.permission = 'manage_workspace_members'
          and wdp.enabled = true
          and exists (
            select 1
            from workspace_members wm
            where wm.ws_id = wg.ws_id
              and wm.user_id = auth.uid()
          )
      )
  )
);

create policy "Workspace members can update workspace guest permissions"
on "public"."workspace_guest_permissions"
as permissive
for update
to authenticated
using (
  exists (
    select 1
    from "public"."workspace_guests" wg
    where wg.id = "workspace_guest_permissions"."guest_id"
      and wg.ws_id in (
        select wrp.ws_id
        from workspace_role_members wrm
        join workspace_role_permissions wrp
          on wrp.role_id = wrm.role_id
         and wrp.ws_id = wg.ws_id
        where wrm.user_id = auth.uid()
          and wrp.permission = 'manage_workspace_members'
          and wrp.enabled = true

        union

        select wdp.ws_id
        from workspace_default_permissions wdp
        where wdp.ws_id = wg.ws_id
          and wdp.permission = 'manage_workspace_members'
          and wdp.enabled = true
          and exists (
            select 1
            from workspace_members wm
            where wm.ws_id = wg.ws_id
              and wm.user_id = auth.uid()
          )
      )
  )
)
with check (
  exists (
    select 1
    from "public"."workspace_guests" wg
    where wg.id = "workspace_guest_permissions"."guest_id"
      and wg.ws_id in (
        select wrp.ws_id
        from workspace_role_members wrm
        join workspace_role_permissions wrp
          on wrp.role_id = wrm.role_id
         and wrp.ws_id = wg.ws_id
        where wrm.user_id = auth.uid()
          and wrp.permission = 'manage_workspace_members'
          and wrp.enabled = true

        union

        select wdp.ws_id
        from workspace_default_permissions wdp
        where wdp.ws_id = wg.ws_id
          and wdp.permission = 'manage_workspace_members'
          and wdp.enabled = true
          and exists (
            select 1
            from workspace_members wm
            where wm.ws_id = wg.ws_id
              and wm.user_id = auth.uid()
          )
      )
  )
);

create policy "Workspace members can delete workspace guest permissions"
on "public"."workspace_guest_permissions"
as permissive
for delete
to authenticated
using (
  exists (
    select 1
    from "public"."workspace_guests" wg
    where wg.id = "workspace_guest_permissions"."guest_id"
      and wg.ws_id in (
        select wrp.ws_id
        from workspace_role_members wrm
        join workspace_role_permissions wrp
          on wrp.role_id = wrm.role_id
         and wrp.ws_id = wg.ws_id
        where wrm.user_id = auth.uid()
          and wrp.permission = 'manage_workspace_members'
          and wrp.enabled = true

        union

        select wdp.ws_id
        from workspace_default_permissions wdp
        where wdp.ws_id = wg.ws_id
          and wdp.permission = 'manage_workspace_members'
          and wdp.enabled = true
          and exists (
            select 1
            from workspace_members wm
            where wm.ws_id = wg.ws_id
              and wm.user_id = auth.uid()
          )
      )
  )
);
