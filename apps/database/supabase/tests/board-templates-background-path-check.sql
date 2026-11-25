-- Contract for 20261125085600_board_templates_background_path_workspace_check.sql:
-- a template background must be `<ws_id>/template-backgrounds/<name>` of the
-- template's own workspace, with no empty, `.` or `..` segment. Legacy rows
-- that predate the NOT VALID constraint stay editable once repaired.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(18);

insert into auth.users (id) values ('5707a6e0-0000-4000-8000-000000009801');
insert into public.users (id) values ('5707a6e0-0000-4000-8000-000000009801')
on conflict do nothing;
insert into public.workspaces (id, name, personal, creator_id) values
  ('5707a6e0-0000-4000-8000-000000009811', 'Template path A', false,
    '5707a6e0-0000-4000-8000-000000009801'),
  ('5707a6e0-0000-4000-8000-000000009812', 'Template path B', false,
    '5707a6e0-0000-4000-8000-000000009801');

select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.board_templates'::regclass
      and conname = 'board_templates_background_path_workspace_check'
      and contype = 'c'
      and not convalidated
  ),
  'the workspace path constraint exists and is NOT VALID'
);

select lives_ok(
  $$insert into public.board_templates (id, ws_id, name, content, background_path) values
    ('5707a6e0-0000-4000-8000-000000009821', '5707a6e0-0000-4000-8000-000000009811', 'ok', '{}',
     '5707a6e0-0000-4000-8000-000000009811/template-backgrounds/a-b_c.png')$$,
  'a path inside the own workspace template-backgrounds folder is accepted'
);
select lives_ok(
  $$insert into public.board_templates (ws_id, name, content, background_path) values
    ('5707a6e0-0000-4000-8000-000000009811', 'no background', '{}', null)$$,
  'a template without a background is accepted'
);
select lives_ok(
  $$insert into public.board_templates (ws_id, name, content, background_path) values
    ('5707a6e0-0000-4000-8000-000000009811', 'nested', '{}',
     '5707a6e0-0000-4000-8000-000000009811/template-backgrounds/sub/dir/file.png')$$,
  'a nested name below the folder is accepted'
);

select throws_ok(
  $$insert into public.board_templates (ws_id, name, content, background_path) values
    ('5707a6e0-0000-4000-8000-000000009812', 'foreign ws', '{}',
     '5707a6e0-0000-4000-8000-000000009811/template-backgrounds/x.png')$$,
  '23514', null, 'a path in another workspace is rejected'
);
select throws_ok(
  $$insert into public.board_templates (ws_id, name, content, background_path) values
    ('5707a6e0-0000-4000-8000-000000009811', 'drive', '{}',
     '5707a6e0-0000-4000-8000-000000009811/docs/report.pdf')$$,
  '23514', null, 'a Drive path is rejected'
);
select throws_ok(
  $$insert into public.board_templates (ws_id, name, content, background_path) values
    ('5707a6e0-0000-4000-8000-000000009811', 'cms', '{}',
     '5707a6e0-0000-4000-8000-000000009811/external-projects/shared/cover.png')$$,
  '23514', null, 'a CMS path is rejected'
);
select throws_ok(
  $$insert into public.board_templates (ws_id, name, content, background_path) values
    ('5707a6e0-0000-4000-8000-000000009811', 'bare', '{}',
     '5707a6e0-0000-4000-8000-000000009811/template-backgrounds/')$$,
  '23514', null, 'the bare folder is rejected'
);
select throws_ok(
  $$insert into public.board_templates (ws_id, name, content, background_path) values
    ('5707a6e0-0000-4000-8000-000000009811', 'dotdot', '{}',
     '5707a6e0-0000-4000-8000-000000009811/template-backgrounds/../docs/x.png')$$,
  '23514', null, 'a .. segment is rejected'
);
select throws_ok(
  $$insert into public.board_templates (ws_id, name, content, background_path) values
    ('5707a6e0-0000-4000-8000-000000009811', 'dot', '{}',
     '5707a6e0-0000-4000-8000-000000009811/template-backgrounds/./x.png')$$,
  '23514', null, 'a . segment is rejected'
);
select throws_ok(
  $$insert into public.board_templates (ws_id, name, content, background_path) values
    ('5707a6e0-0000-4000-8000-000000009811', 'empty segment', '{}',
     '5707a6e0-0000-4000-8000-000000009811/template-backgrounds//x.png')$$,
  '23514', null, 'an empty segment is rejected'
);
select throws_ok(
  $$insert into public.board_templates (ws_id, name, content, background_path) values
    ('5707a6e0-0000-4000-8000-000000009811', 'leading slash', '{}',
     '/5707a6e0-0000-4000-8000-000000009811/template-backgrounds/x.png')$$,
  '23514', null, 'a leading slash is rejected'
);
select throws_ok(
  $$insert into public.board_templates (ws_id, name, content, background_path) values
    ('5707a6e0-0000-4000-8000-000000009811', 'empty string', '{}', '')$$,
  '23514', null, 'an empty path is rejected'
);
select throws_ok(
  $$insert into public.board_templates (ws_id, name, content, background_path) values
    ('5707a6e0-0000-4000-8000-000000009811', 'upper', '{}',
     upper('5707a6e0-0000-4000-8000-000000009811') || '/template-backgrounds/x.png')$$,
  '23514', null, 'a differently cased workspace prefix is rejected'
);
select throws_ok(
  $$update public.board_templates
    set background_path = '5707a6e0-0000-4000-8000-000000009812/template-backgrounds/x.png'
    where id = '5707a6e0-0000-4000-8000-000000009821'$$,
  '23514', null, 'updating a template to another workspace path is rejected'
);
select lives_ok(
  $$update public.board_templates set background_path = null
    where id = '5707a6e0-0000-4000-8000-000000009821'$$,
  'clearing the background is accepted'
);

-- A legacy row that predates the constraint: simulate by building it without
-- the constraint, then re-adding it NOT VALID.
alter table public.board_templates
  drop constraint board_templates_background_path_workspace_check;
insert into public.board_templates (id, ws_id, name, content, background_path) values
  ('5707a6e0-0000-4000-8000-000000009822', '5707a6e0-0000-4000-8000-000000009811', 'legacy', '{}',
   '5707a6e0-0000-4000-8000-000000009811/docs/legacy.pdf');
alter table public.board_templates
  add constraint board_templates_background_path_workspace_check
  check (
    background_path is null
    or (
      pg_catalog.starts_with(background_path, ws_id::text || '/template-backgrounds/')
      and pg_catalog.length(background_path)
        > pg_catalog.length(ws_id::text || '/template-backgrounds/')
      and background_path !~ '(^|/)(\.{1,2})?(/|$)'
    )
  ) not valid;

select throws_ok(
  $$update public.board_templates set name = 'renamed'
    where id = '5707a6e0-0000-4000-8000-000000009822'$$,
  '23514', null,
  'a legacy row with an invalid path cannot be edited until its path is repaired'
);
select lives_ok(
  $$update public.board_templates
    set background_path = '5707a6e0-0000-4000-8000-000000009811/template-backgrounds/fixed.png'
    where id = '5707a6e0-0000-4000-8000-000000009822'$$,
  'repairing the legacy path is accepted'
);

select * from finish();
rollback;
