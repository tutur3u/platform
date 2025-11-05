-- Backfill missing workspace_members for existing workspace_user_linked_users
-- Rationale: RLS on workspace_user_linked_users requires the linked platform user
-- to be a member of the same workspace. In prod there are orphan link rows
-- (link exists but membership missing). This insert is idempotent.

begin;

insert into public.workspace_members (ws_id, user_id, created_at)
select wulu.ws_id,
       wulu.platform_user_id,
       now()
from public.workspace_user_linked_users wulu
left join public.workspace_members wm
  on wm.user_id = wulu.platform_user_id
 and wm.ws_id   = wulu.ws_id
where wm.user_id is null;

commit;


