drop policy "Enable read access for workspace members" on "public"."sent_emails";

create policy "Enable all access for all users"
on "public"."sent_emails"
as permissive
for all
to authenticated
using (((post_id IS NULL) OR (EXISTS ( SELECT 1
   FROM user_group_posts ugp
  WHERE (ugp.id = sent_emails.post_id))) OR (EXISTS ( SELECT 1
   FROM workspace_users wu
  WHERE (wu.id = sent_emails.receiver_id)))))
with check (((post_id IS NULL) OR (EXISTS ( SELECT 1
   FROM user_group_posts ugp
  WHERE (ugp.id = sent_emails.post_id))) OR (EXISTS ( SELECT 1
   FROM workspace_users wu
  WHERE (wu.id = sent_emails.receiver_id)))));



