alter table "public"."workspace_boards"
add column if not exists "default_done_list_id" uuid,
add column if not exists "default_closed_list_id" uuid;

create index if not exists "workspace_boards_default_done_list_id_idx"
on "public"."workspace_boards" using btree ("default_done_list_id")
where "default_done_list_id" is not null;

create index if not exists "workspace_boards_default_closed_list_id_idx"
on "public"."workspace_boards" using btree ("default_closed_list_id")
where "default_closed_list_id" is not null;

comment on column "public"."workspace_boards"."default_done_list_id"
is 'Optional default done task list for board-level terminal task moves. Validated by API because the column intentionally has no foreign key for rollout safety.';

comment on column "public"."workspace_boards"."default_closed_list_id"
is 'Optional default closed task list for board-level terminal task moves. Validated by API because the column intentionally has no foreign key for rollout safety.';
