create policy "Enable all access for workspace members"
on "public"."workspace_cron_executions"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspace_cron_jobs wcj
  WHERE (wcj.id = workspace_cron_executions.job_id))))
with check ((EXISTS ( SELECT 1
   FROM workspace_cron_jobs wcj
  WHERE (wcj.id = workspace_cron_executions.job_id))));


create policy "Enable all access for workspace members"
on "public"."workspace_cron_jobs"
as permissive
for all
to authenticated
using (is_org_member(auth.uid(), ws_id))
with check (is_org_member(auth.uid(), ws_id));



