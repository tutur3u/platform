create or replace view public.entity_limit_source__workspaces as
select
  w.id,
  personal_ws.id as personal_ws_id,
  w.creator_id as user_id,
  w.created_at
from public.workspaces w
left join lateral (
  select pw.id
  from public.workspaces pw
  where pw.creator_id = w.creator_id
    and pw.personal is true
  order by pw.created_at asc nulls last
  limit 1
) personal_ws on true;

comment on view public.entity_limit_source__workspaces is
  'Source view for workspace creation limits: id is the workspace id, personal_ws_id is the creator personal workspace id, user_id is creator_id.';

create or replace view public.entity_limit_source__tasks as
select
  t.id,
  wb.ws_id as ws_id,
  t.creator_id as user_id,
  t.created_at
from public.tasks t
left join public.workspace_boards wb
  on wb.id = t.board_id;

comment on view public.entity_limit_source__tasks is
  'Source view for task creation limits: ws_id inferred from tasks.board_id or fallback tasks.list_id -> task_lists.board_id.';

create or replace view public.entity_limit_source__workspace_whiteboards as
select
  wb.id,
  wb.ws_id,
  wb.creator_id as user_id,
  wb.created_at
from public.workspace_whiteboards wb;

comment on view public.entity_limit_source__workspace_whiteboards is
  'Source view for whiteboard creation limits: direct ws_id and creator_id mapping.';
