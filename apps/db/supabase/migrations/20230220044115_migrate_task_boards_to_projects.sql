drop trigger if exists "add_task_board_creator_tr" on "public"."task_boards";

drop policy "Enable delete for members of the task board" on "public"."task_boards";

drop policy "Enable insert for authenticated users only" on "public"."task_boards";

drop policy "Enable read access for members of the task board" on "public"."task_boards";

drop policy "Enable read access for the creator of the task board" on "public"."task_boards";

drop policy "Enable update for members of the task board" on "public"."task_boards";

alter table "public"."task_boards" drop constraint "task_boards_creator_id_fkey";

alter table "public"."org_boards" drop constraint "org_boards_board_id_fkey";

alter table "public"."task_lists" drop constraint "task_lists_board_id_fkey";

drop table "public"."task_boards" cascade;

create table "public"."project_boards" (
    "id" uuid not null default gen_random_uuid(),
    "name" text,
    "archived" boolean default false,
    "deleted" boolean default false,
    "created_at" timestamp with time zone default now(),
    "creator_id" uuid default auth.uid(),
    "project_id" uuid
);


alter table "public"."project_boards" enable row level security;

CREATE UNIQUE INDEX task_boards_pkey ON public.project_boards USING btree (id);

alter table "public"."project_boards" add constraint "task_boards_pkey" PRIMARY KEY using index "task_boards_pkey";

alter table "public"."project_boards" add constraint "project_boards_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES users(id) not valid;

alter table "public"."project_boards" validate constraint "project_boards_creator_id_fkey";

alter table "public"."project_boards" add constraint "project_boards_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) not valid;

alter table "public"."project_boards" validate constraint "project_boards_project_id_fkey";

alter table "public"."org_boards" add constraint "org_boards_board_id_fkey" FOREIGN KEY (board_id) REFERENCES project_boards(id) not valid;

alter table "public"."org_boards" validate constraint "org_boards_board_id_fkey";

alter table "public"."task_lists" add constraint "task_lists_board_id_fkey" FOREIGN KEY (board_id) REFERENCES project_boards(id) ON DELETE CASCADE not valid;

alter table "public"."task_lists" validate constraint "task_lists_board_id_fkey";

create policy "Enable delete for members of the task board"
on "public"."project_boards"
as permissive
for delete
to authenticated
using (is_task_board_member(auth.uid(), id));


create policy "Enable insert for authenticated users only"
on "public"."project_boards"
as permissive
for insert
to authenticated
with check (true);


create policy "Enable read access for members of the task board"
on "public"."project_boards"
as permissive
for select
to authenticated
using (is_task_board_member(auth.uid(), id));


create policy "Enable read access for the creator of the task board"
on "public"."project_boards"
as permissive
for select
to authenticated
using ((creator_id = auth.uid()));


create policy "Enable update for members of the task board"
on "public"."project_boards"
as permissive
for update
to authenticated
using (is_task_board_member(auth.uid(), id))
with check (is_task_board_member(auth.uid(), id));


CREATE TRIGGER add_task_board_creator_tr AFTER INSERT ON public.project_boards FOR EACH ROW EXECUTE FUNCTION add_task_board_creator();


