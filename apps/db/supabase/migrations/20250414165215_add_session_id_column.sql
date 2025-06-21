alter table "public"."nova_submissions" add column "session_id" uuid;

alter table "public"."nova_submissions" add constraint "nova_submissions_session_id_fkey" FOREIGN KEY (session_id) REFERENCES nova_sessions(id) not valid;

alter table "public"."nova_submissions" validate constraint "nova_submissions_session_id_fkey";


