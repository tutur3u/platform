create table "public"."workspace_boards_columns" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "board_id" uuid default gen_random_uuid(),
    "title" text
);


alter table "public"."workspace_boards_columns" enable row level security;

CREATE UNIQUE INDEX workspace_boards_columns_pkey ON public.workspace_boards_columns USING btree (id);

alter table "public"."workspace_boards_columns" add constraint "workspace_boards_columns_pkey" PRIMARY KEY using index "workspace_boards_columns_pkey";

alter table "public"."workspace_boards_columns" add constraint "workspace_boards_columns_board_id_fkey" FOREIGN KEY (board_id) REFERENCES workspace_boards(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."workspace_boards_columns" validate constraint "workspace_boards_columns_board_id_fkey";

grant delete on table "public"."workspace_boards_columns" to "anon";

grant insert on table "public"."workspace_boards_columns" to "anon";

grant references on table "public"."workspace_boards_columns" to "anon";

grant select on table "public"."workspace_boards_columns" to "anon";

grant trigger on table "public"."workspace_boards_columns" to "anon";

grant truncate on table "public"."workspace_boards_columns" to "anon";

grant update on table "public"."workspace_boards_columns" to "anon";

grant delete on table "public"."workspace_boards_columns" to "authenticated";

grant insert on table "public"."workspace_boards_columns" to "authenticated";

grant references on table "public"."workspace_boards_columns" to "authenticated";

grant select on table "public"."workspace_boards_columns" to "authenticated";

grant trigger on table "public"."workspace_boards_columns" to "authenticated";

grant truncate on table "public"."workspace_boards_columns" to "authenticated";

grant update on table "public"."workspace_boards_columns" to "authenticated";

grant delete on table "public"."workspace_boards_columns" to "service_role";

grant insert on table "public"."workspace_boards_columns" to "service_role";

grant references on table "public"."workspace_boards_columns" to "service_role";

grant select on table "public"."workspace_boards_columns" to "service_role";

grant trigger on table "public"."workspace_boards_columns" to "service_role";

grant truncate on table "public"."workspace_boards_columns" to "service_role";

grant update on table "public"."workspace_boards_columns" to "service_role";


