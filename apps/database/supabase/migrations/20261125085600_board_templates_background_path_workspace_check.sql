-- A board template's background must live in its own workspace's
-- `template-backgrounds/` folder: `<ws_id>/template-backgrounds/<name>`, with no
-- empty, `.` or `..` segments. The template APIs already enforce this
-- (`isWorkspaceTemplateBackgroundPath`) and workspace_storage.object_access
-- already ignores any other pointer, but members can write board_templates
-- directly, so enforce the shape in the database too.
--
-- NOT VALID: new and updated rows are checked immediately; existing rows are
-- not scanned, so a legacy row with an unexpected path cannot block this
-- migration. Run `alter table public.board_templates validate constraint
-- board_templates_background_path_workspace_check;` once a census of
--   select count(*) from public.board_templates
--   where background_path is not null and not (<the check expression below>);
-- returns zero. A legacy row that violates the shape can be edited again as
-- soon as its background_path is repaired or cleared.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.board_templates
  add constraint board_templates_background_path_workspace_check
  check (
    background_path is null
    or (
      pg_catalog.starts_with(
        background_path,
        ws_id::text || '/template-backgrounds/'
      )
      and pg_catalog.length(background_path)
        > pg_catalog.length(ws_id::text || '/template-backgrounds/')
      and background_path !~ '(^|/)(\.{1,2})?(/|$)'
    )
  ) not valid;

commit;
