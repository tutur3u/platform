drop policy "Enable all access for all users" on "public"."sent_emails";

alter table "public"."sent_emails" add column "ws_id" uuid;

alter table "public"."sent_emails" add constraint "sent_emails_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."sent_emails" validate constraint "sent_emails_ws_id_fkey";

create policy "Enable all access for workspace members"
on "public"."sent_emails"
as permissive
for all
to authenticated
using ((((EXISTS ( SELECT 1
   FROM workspaces wss
  WHERE (wss.id = sent_emails.ws_id))) AND (EXISTS ( SELECT 1
   FROM user_group_posts ugp
  WHERE (ugp.id = sent_emails.post_id)))) OR (EXISTS ( SELECT 1
   FROM workspace_users wu
  WHERE (wu.id = sent_emails.receiver_id)))))
with check ((((EXISTS ( SELECT 1
   FROM workspaces wss
  WHERE (wss.id = sent_emails.ws_id))) AND (EXISTS ( SELECT 1
   FROM user_group_posts ugp
  WHERE (ugp.id = sent_emails.post_id)))) OR (EXISTS ( SELECT 1
   FROM workspace_users wu
  WHERE (wu.id = sent_emails.receiver_id)))));



