alter table "public"."external_user_monthly_reports" drop constraint "external_user_monthly_reports_user_id_fkey";

alter table "public"."external_user_monthly_reports" add constraint "public_external_user_monthly_reports_user_id_fkey" FOREIGN KEY (user_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."external_user_monthly_reports" validate constraint "public_external_user_monthly_reports_user_id_fkey";