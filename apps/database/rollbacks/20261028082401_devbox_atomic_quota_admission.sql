begin;
drop trigger devbox_quota_guard_run on private.devbox_runs;
drop trigger devbox_quota_account_run on private.devbox_runs;
drop function private.devbox_quota_guard_run();
drop function private.devbox_quota_account_run();
drop function private.create_personal_devbox_run(uuid,uuid,jsonb);
commit;
