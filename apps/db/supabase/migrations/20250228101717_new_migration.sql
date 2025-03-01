alter table "public"."nova_submissions" drop constraint "nova_users_problem_history_problem_id_fkey";

alter table "public"."nova_submissions" drop constraint "nova_users_problem_history_userId_fkey";

alter table "public"."nova_test_timer_records" drop constraint "nova_test_timer_records_problem_id_fkey";

alter table "public"."nova_test_timer_records" drop constraint "nova_test_timer_records_user_id_fkey";

alter table "public"."nova_user_challenge" drop constraint "nova_user_challenge_challenge_id_fkey";

alter table "public"."nova_user_challenge" drop constraint "nova_user_challenge_user_id_fkey";

alter table "public"."nova_submissions" add constraint "nova_submissions_problem_id_fkey" FOREIGN KEY (problem_id) REFERENCES nova_problems(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_submissions" validate constraint "nova_submissions_problem_id_fkey";

alter table "public"."nova_submissions" add constraint "nova_submissions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_submissions" validate constraint "nova_submissions_user_id_fkey";

alter table "public"."nova_test_timer_records" add constraint "nova_test_timer_records_problem_id_fkey" FOREIGN KEY (problem_id) REFERENCES nova_problems(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_test_timer_records" validate constraint "nova_test_timer_records_problem_id_fkey";

alter table "public"."nova_test_timer_records" add constraint "nova_test_timer_records_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_test_timer_records" validate constraint "nova_test_timer_records_user_id_fkey";

alter table "public"."nova_user_challenge" add constraint "nova_user_challenge_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES nova_challenges(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_user_challenge" validate constraint "nova_user_challenge_challenge_id_fkey";

alter table "public"."nova_user_challenge" add constraint "nova_user_challenge_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_user_challenge" validate constraint "nova_user_challenge_user_id_fkey";


