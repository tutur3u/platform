alter table "public"."nova_users_problem_history" drop constraint "nova_users_problem_history_userId_fkey";

alter table "public"."nova_users_problem_history" add constraint "nova_users_problem_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) not valid;

alter table "public"."nova_users_problem_history" validate constraint "nova_users_problem_history_userId_fkey";


