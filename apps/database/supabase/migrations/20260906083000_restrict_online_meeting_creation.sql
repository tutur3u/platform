-- Restrictive policy composes with existing workspace-membership permissions.
-- Use the signed account email, never mutable user_metadata or profile fields.
create policy "Only Tuturuuu accounts can create online meetings"
on public.workspace_meetings as restrictive
for insert to authenticated
with check (
  creator_id = (select auth.uid())
  and coalesce((select auth.jwt()) ->> 'email', '') ~* '^[^[:space:]@]+@tuturuuu\.com$'
);
