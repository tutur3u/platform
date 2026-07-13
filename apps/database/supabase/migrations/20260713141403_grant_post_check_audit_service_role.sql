grant select, insert
on table private.user_group_post_check_logs
to service_role;

revoke all privileges
on table private.user_group_post_check_logs
from anon, authenticated;
