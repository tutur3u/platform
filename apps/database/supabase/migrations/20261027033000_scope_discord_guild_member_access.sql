begin;

alter policy "Allow users who have access to workspace"
on public.discord_guild_members
to authenticated
using (
  exists (
    select 1
    from public.discord_integrations di
    join public.workspace_members actor on actor.ws_id = di.ws_id
    where di.discord_guild_id = discord_guild_members.discord_guild_id
      and actor.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.discord_integrations di
    join public.workspace_members actor on actor.ws_id = di.ws_id
    join public.workspace_members mapped on mapped.ws_id = di.ws_id
    where di.discord_guild_id = discord_guild_members.discord_guild_id
      and actor.user_id = (select auth.uid())
      and mapped.user_id = discord_guild_members.platform_user_id
  )
);

commit;
