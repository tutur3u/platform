alter table "public"."nova_user_challenge" drop constraint "nova_leaderboard_problem_id_fkey";

alter table "public"."nova_user_challenge" drop constraint "nova_leaderboard_userId_fkey";

alter table "public"."nova_user_challenge" drop constraint "nova_leaderboard_pkey";

drop index if exists "public"."nova_leaderboard_pkey";

alter table "public"."nova_user_challenge" drop column "id";

alter table "public"."nova_user_challenge" drop column "problem_id";

alter table "public"."nova_user_challenge" drop column "score";

alter table "public"."nova_user_challenge" add column "challenge_id" uuid;

alter table "public"."nova_user_challenge" add column "feedback" text;

alter table "public"."nova_user_challenge" add column "total_score" real;

alter table "public"."nova_user_challenge" add constraint "nova_user_challenge_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES nova_challenges(id) not valid;

alter table "public"."nova_user_challenge" validate constraint "nova_user_challenge_challenge_id_fkey";

alter table "public"."nova_user_challenge" add constraint "nova_user_challenge_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) not valid;

alter table "public"."nova_user_challenge" validate constraint "nova_user_challenge_user_id_fkey";


