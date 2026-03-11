drop policy if exists "Workspace members can read and write whiteboards"
on "public"."workspace_whiteboards";

create policy "Workspace members can read whiteboards"
on "public"."workspace_whiteboards"
as permissive
for select
to authenticated
using (
  ws_id in (
    select ws_id
    from public.workspace_members
    where user_id = auth.uid()
  )
);

create policy "Workspace members can insert whiteboards"
on "public"."workspace_whiteboards"
as permissive
for insert
to authenticated
with check (
  creator_id = auth.uid()
  and ws_id in (
    select ws_id
    from public.workspace_members
    where user_id = auth.uid()
  )
);

create policy "Workspace members can update whiteboards"
on "public"."workspace_whiteboards"
as permissive
for update
to authenticated
using (
  ws_id in (
    select ws_id
    from public.workspace_members
    where user_id = auth.uid()
  )
)
with check (
  ws_id in (
    select ws_id
    from public.workspace_members
    where user_id = auth.uid()
  )
);

create policy "Workspace members can delete whiteboards"
on "public"."workspace_whiteboards"
as permissive
for delete
to authenticated
using (
  ws_id in (
    select ws_id
    from public.workspace_members
    where user_id = auth.uid()
  )
);

alter table "public"."workspace_whiteboards"
  add constraint "workspace_whiteboards_title_trimmed_check"
  check (title = btrim(title))
  not valid;

alter table "public"."workspace_whiteboards"
  add constraint "workspace_whiteboards_title_not_empty_check"
  check (btrim(title) <> '')
  not valid;

alter table "public"."workspace_whiteboards"
  add constraint "workspace_whiteboards_title_length_check"
  check (char_length(title) <= 120)
  not valid;

alter table "public"."workspace_whiteboards"
  add constraint "workspace_whiteboards_description_length_check"
  check (description is null or char_length(description) <= 500)
  not valid;

alter table "public"."workspace_whiteboards"
  add constraint "workspace_whiteboards_title_repeated_run_check"
  check (title !~ '(.)\1{32,}')
  not valid;

alter table "public"."workspace_whiteboards"
  add constraint "workspace_whiteboards_description_repeated_run_check"
  check (description is null or description !~ '(.)\1{32,}')
  not valid;

create or replace function public.enforce_whiteboard_create_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_creates integer;
begin
  perform pg_advisory_xact_lock(
    hashtext(new.ws_id::text),
    hashtext(new.creator_id::text)
  );

  select count(*)
  into recent_creates
  from public.workspace_whiteboards
  where ws_id = new.ws_id
    and creator_id = new.creator_id
    and created_at >= now() - interval '10 minutes';

  if recent_creates >= 5 then
    raise exception 'WHITEBOARD_CREATE_RATE_LIMIT_EXCEEDED'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_whiteboard_create_rate_limit
on public.workspace_whiteboards;

create trigger enforce_whiteboard_create_rate_limit
before insert on public.workspace_whiteboards
for each row
execute function public.enforce_whiteboard_create_rate_limit();
