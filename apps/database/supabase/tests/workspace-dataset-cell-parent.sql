begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

insert into public.users (id, display_name)
values
  ('31000000-0000-4000-8000-000000000001', 'Dataset owner A'),
  ('31000000-0000-4000-8000-000000000002', 'Dataset owner B')
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values
  (
    '31000000-0000-4000-8000-000000000010',
    'Dataset workspace A',
    '31000000-0000-4000-8000-000000000001',
    false
  ),
  (
    '31000000-0000-4000-8000-000000000011',
    'Dataset workspace B',
    '31000000-0000-4000-8000-000000000002',
    false
  )
on conflict (id) do nothing;

insert into public.workspace_datasets (id, ws_id, name)
values
  (
    '31000000-0000-4000-8000-0000000000a0',
    '31000000-0000-4000-8000-000000000010',
    'Dataset A'
  ),
  (
    '31000000-0000-4000-8000-0000000000b0',
    '31000000-0000-4000-8000-000000000011',
    'Dataset B'
  );

insert into public.workspace_dataset_rows (id, dataset_id)
values
  ('31000000-0000-4000-8000-0000000000a1', '31000000-0000-4000-8000-0000000000a0'),
  ('31000000-0000-4000-8000-0000000000b1', '31000000-0000-4000-8000-0000000000b0'),
  ('31000000-0000-4000-8000-0000000000b2', '31000000-0000-4000-8000-0000000000b0');

insert into public.workspace_dataset_columns (id, dataset_id, name)
values
  ('31000000-0000-4000-8000-0000000000a3', '31000000-0000-4000-8000-0000000000a0', 'field-a'),
  ('31000000-0000-4000-8000-0000000000b3', '31000000-0000-4000-8000-0000000000b0', 'field-b');

select lives_ok(
  $$
    insert into public.workspace_dataset_cells (dataset_id, row_id, column_id, data)
    values (
      '31000000-0000-4000-8000-0000000000b0',
      '31000000-0000-4000-8000-0000000000b1',
      '31000000-0000-4000-8000-0000000000b3',
      'b-value'
    )
  $$,
  'a cell whose row and column share its dataset is accepted'
);

select throws_ok(
  $$
    insert into public.workspace_dataset_cells (dataset_id, row_id, column_id, data)
    values (
      '31000000-0000-4000-8000-0000000000a0',
      '31000000-0000-4000-8000-0000000000b1',
      '31000000-0000-4000-8000-0000000000a3',
      'injected-by-a'
    )
  $$,
  '23514',
  null,
  'a cell cannot point at a row of another dataset'
);

select throws_ok(
  $$
    insert into public.workspace_dataset_cells (dataset_id, row_id, column_id, data)
    values (
      '31000000-0000-4000-8000-0000000000b0',
      '31000000-0000-4000-8000-0000000000b1',
      '31000000-0000-4000-8000-0000000000a3',
      'foreign-column'
    )
  $$,
  '23514',
  null,
  'a cell cannot point at a column of another dataset'
);

select throws_ok(
  $$
    update public.workspace_dataset_cells
    set row_id = '31000000-0000-4000-8000-0000000000a1'
    where row_id = '31000000-0000-4000-8000-0000000000b1'
  $$,
  '23514',
  null,
  'an existing cell cannot be relinked to a row of another dataset'
);

select throws_ok(
  $$
    update public.workspace_dataset_rows
    set dataset_id = '31000000-0000-4000-8000-0000000000a0'
    where id = '31000000-0000-4000-8000-0000000000b1'
  $$,
  '23514',
  null,
  'a row cannot move to another dataset'
);

-- Simulate an inconsistent cell written before the trigger existed.
set local session_replication_role = replica;

insert into public.workspace_dataset_cells (dataset_id, row_id, column_id, data)
values (
  '31000000-0000-4000-8000-0000000000a0',
  '31000000-0000-4000-8000-0000000000b1',
  '31000000-0000-4000-8000-0000000000a3',
  'legacy-injected-by-a'
);

set local session_replication_role = origin;

select is(
  (
    select cells
    from public.workspace_dataset_row_cells
    where row_id = '31000000-0000-4000-8000-0000000000b1'
  ),
  '{"field-b": "b-value"}'::jsonb,
  'the row-cells view ignores cells and columns from another dataset'
);

select lives_ok(
  $$
    select cells
    from public.workspace_dataset_row_cells
    where dataset_id = '31000000-0000-4000-8000-0000000000b0'
  $$,
  'the row-cells view tolerates a row without cells'
);

select is(
  (
    select cells
    from public.workspace_dataset_row_cells
    where row_id = '31000000-0000-4000-8000-0000000000b2'
  ),
  null::jsonb,
  'a row without cells aggregates to null'
);

select * from finish();

rollback;
