-- Remove the feature flag requirement from workspace creation
-- Everyone can now create workspaces, with limits enforced at the RLS level

-- Function to check if a user's email is a Tuturuuu email
create or replace function public.is_tuturuuu_email(user_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select user_email ~ '^[^\s@]+@(tuturuuu\.com|xwf\.tuturuuu\.com)$';
$$;

-- Function to count non-deleted workspaces created by a user
create or replace function public.count_user_workspaces(user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from public.workspaces
  where creator_id = user_id
    and deleted = false;
$$;

-- Drop the old policy (if exists to avoid errors if not yet applied)
drop policy if exists "Enable insert for authenticated users only" on "public"."workspaces";

-- Create new policy with workspace limit enforcement
-- Note: The limit value (10) is defined as MAX_WORKSPACES_FOR_FREE_USERS in packages/utils/src/constants.ts
create policy "Enable insert for authenticated users only"
on "public"."workspaces"
as permissive
for insert
to authenticated
with check (
  creator_id = auth.uid()
  and (
    -- Allow unlimited workspaces for Tuturuuu emails
    is_tuturuuu_email(
      (select email from public.user_private_details where user_id = auth.uid())
    )
    or
    -- Limit to 10 workspaces for non-Tuturuuu emails
    count_user_workspaces(auth.uid()) < 10
  )
);
