alter table "public"."nova_submission_highest_score" add column "user_id" uuid;

alter table "public"."nova_submission_highest_score" disable row level security;

alter table "public"."nova_submission_highest_score" add constraint "nova_submission_highest_score_problem_id_fkey" FOREIGN KEY (problem_id) REFERENCES nova_problems(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."nova_submission_highest_score" validate constraint "nova_submission_highest_score_problem_id_fkey";

alter table "public"."nova_submission_highest_score" add constraint "nova_submission_highest_score_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) not valid;

alter table "public"."nova_submission_highest_score" validate constraint "nova_submission_highest_score_user_id_fkey";


