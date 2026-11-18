-- Workspace invitations are redeemed only through the server accept-invite
-- flow, which verifies the confirmed Auth email, seats and the invited type
-- before writing membership with the service role. A signed-in client may
-- insert its own workspace_members row only to bootstrap an empty workspace it
-- created. The invite branch of the client INSERT policy is removed instead of
-- relying on it failing closed.

set local lock_timeout = '5s';

drop policy if exists "Allow workspace managers to insert members with constraints"
  on public.workspace_members;

create policy "Allow workspace managers to insert members with constraints"
on public.workspace_members
as permissive
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.current_user_can_bootstrap_workspace(ws_id)
);

-- The invite type helper has no client caller once the policy branch is gone.
-- It stays available to the service role for server-side checks.
revoke execute on function public.current_user_workspace_invite_type(uuid)
  from public, anon, authenticated;
grant execute on function public.current_user_workspace_invite_type(uuid)
  to service_role;
