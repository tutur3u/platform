alter table "public"."nova_users_problem_history" drop constraint "nova_users_problem_history_userId_fkey";

alter table "public"."nova_users_problem_history" drop column "userId";

alter table "public"."nova_users_problem_history" add column "user_id" uuid;

alter table "public"."nova_users_problem_history" add constraint "nova_users_problem_history_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) not valid;

alter table "public"."nova_users_problem_history" validate constraint "nova_users_problem_history_user_id_fkey";


