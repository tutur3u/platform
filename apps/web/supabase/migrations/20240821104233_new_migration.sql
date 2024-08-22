alter table "public"."send_emails" add column "email" text;

alter table "public"."send_emails" add column "post_id" uuid;

alter table "public"."send_emails" add constraint "send_emails_post_id_fkey" FOREIGN KEY (post_id) REFERENCES user_group_posts(id) not valid;

alter table "public"."send_emails" validate constraint "send_emails_post_id_fkey";


