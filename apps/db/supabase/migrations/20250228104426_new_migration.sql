alter table "public"."nova_test_timer_records" drop constraint "nova_test_timer_records_problem_id_fkey";

alter table "public"."nova_test_timer_records" drop column "problem_id";

alter table "public"."nova_test_timer_records" add column "challenge_id" uuid;

alter table "public"."nova_test_timer_records" add constraint "nova_test_timer_records_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES nova_challenges(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_test_timer_records" validate constraint "nova_test_timer_records_challenge_id_fkey";


