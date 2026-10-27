-- Restores the prior policy. Apply only under an explicitly approved rollback.
begin;

alter policy "Allow users who have access to workspace"
on public.discord_guild_members
to authenticated
using (
  exists (
    select 1 from public.discord_integrations di
    join public.workspace_members wm on wm.ws_id = di.ws_id
    where wm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.discord_integrations di
    join public.workspace_members wm on wm.ws_id = di.ws_id
    where wm.user_id = (select auth.uid())
  )
);

commit;
