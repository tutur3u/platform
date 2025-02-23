alter table "public"."nova_test_timer_record" drop constraint "nova_test_timer_record_userId_fkey";

alter table "public"."nova_test_timer_record" drop column "userId";

alter table "public"."nova_test_timer_record" add column "user_id" uuid;

alter table "public"."nova_test_timer_record" add constraint "nova_test_timer_record_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) not valid;

alter table "public"."nova_test_timer_record" validate constraint "nova_test_timer_record_user_id_fkey";


