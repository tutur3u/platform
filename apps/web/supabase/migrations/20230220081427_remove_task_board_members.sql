drop policy "Enable read access for members of the task board" on "public"."task_board_members";

alter table "public"."task_board_members" drop constraint "task_board_members_board_id_fkey";

alter table "public"."task_board_members" drop constraint "task_board_members_user_id_fkey";

alter table "public"."task_board_members" drop constraint "task_board_members_pkey";

drop index if exists "public"."task_board_members_pkey";

drop table "public"."task_board_members";


