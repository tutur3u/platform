drop policy "Enable delete for members of the task board" on "public"."project_boards";

drop policy "Enable insert for authenticated users only" on "public"."project_boards";

drop policy "Enable read access for members of the task board" on "public"."project_boards";

drop policy "Enable read access for the creator of the task board" on "public"."project_boards";

drop policy "Enable update for members of the task board" on "public"."project_boards";

alter table "public"."org_boards" drop constraint "org_boards_board_id_fkey";

alter table "public"."org_boards" drop constraint "org_boards_org_id_fkey";

alter table "public"."team_members" drop constraint "team_members_team_id_fkey";

alter table "public"."team_members" drop constraint "team_members_user_id_fkey";

alter table "public"."team_projects" drop constraint "team_projects_project_id_fkey";

alter table "public"."team_projects" drop constraint "team_projects_team_id_fkey";

alter table "public"."teams" drop constraint "teams_org_id_fkey";

alter table "public"."org_boards" drop constraint "org_boards_pkey";

alter table "public"."team_members" drop constraint "team_members_pkey";

alter table "public"."team_projects" drop constraint "team_projects_pkey";

alter table "public"."teams" drop constraint "teams_pkey";

drop index if exists "public"."org_boards_pkey";

drop index if exists "public"."team_members_pkey";

drop index if exists "public"."team_projects_pkey";

drop index if exists "public"."teams_pkey";

drop table "public"."org_boards";

drop table "public"."team_members";

drop table "public"."team_projects";

drop table "public"."teams";

create policy "Enable all access for project members"
on "public"."project_boards"
as permissive
for all
to authenticated
using (is_project_member(project_id))
with check (is_project_member(project_id));



