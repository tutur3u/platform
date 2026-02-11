alter table "public"."user_group_post_checks" add column "email_id" uuid;

CREATE UNIQUE INDEX user_group_post_checks_email_id_key ON public.user_group_post_checks USING btree (email_id);

alter table "public"."user_group_post_checks" add constraint "user_group_post_checks_email_id_fkey" FOREIGN KEY (email_id) REFERENCES sent_emails(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."user_group_post_checks" validate constraint "user_group_post_checks_email_id_fkey";

alter table "public"."user_group_post_checks" add constraint "user_group_post_checks_email_id_key" UNIQUE using index "user_group_post_checks_email_id_key";
