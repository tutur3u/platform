-- Keep dataset cells, rows and columns inside one dataset.
--
-- workspace_dataset_cells has independent foreign keys to its dataset, row and
-- column, so a member of one workspace could attach a cell from their dataset
-- to a row of another workspace's dataset. The row-cells view joined cells by
-- row only, so the other workspace's aggregated rows (including API-key reads
-- through the admin client) would include the injected field.

-- 1. Aggregate only cells and columns that belong to the row's dataset.
--    The FILTER also returns NULL instead of failing for rows with no cells.
create or replace view public.workspace_dataset_row_cells
with (security_invoker = on) as
select
  wdr.id as row_id,
  wdr.dataset_id,
  wdr.created_at,
  jsonb_object_agg(wdc.name, wdc.data) filter (where wdc.name is not null)
    as cells
from
  public.workspace_dataset_rows wdr
  left join lateral (
    select
      c.data,
      col.name
    from
      public.workspace_dataset_cells c
      join public.workspace_dataset_columns col
        on col.id = c.column_id
        and col.dataset_id = wdr.dataset_id
    where
      c.row_id = wdr.id
      and c.dataset_id = wdr.dataset_id
  ) wdc on true
group by
  wdr.id,
  wdr.dataset_id,
  wdr.created_at;

-- 2. Reject new or updated cells whose row or column is in another dataset.
create or replace function public.enforce_workspace_dataset_cell_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.workspace_dataset_rows r
    where r.id = new.row_id
      and r.dataset_id = new.dataset_id
  ) or not exists (
    select 1
    from public.workspace_dataset_columns c
    where c.id = new.column_id
      and c.dataset_id = new.dataset_id
  ) then
    raise exception 'Dataset cell row and column must belong to its dataset'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_workspace_dataset_cell_parent()
from public, anon, authenticated;

drop trigger if exists enforce_workspace_dataset_cell_parent
on public.workspace_dataset_cells;

create trigger enforce_workspace_dataset_cell_parent
before insert or update of dataset_id, row_id, column_id
on public.workspace_dataset_cells
for each row
execute function public.enforce_workspace_dataset_cell_parent();

-- 3. Rows and columns cannot move to another dataset, which would leave their
--    existing cells pointing across datasets.
create or replace function public.prevent_workspace_dataset_parent_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.dataset_id is distinct from old.dataset_id then
    raise exception 'Dataset rows and columns cannot move between datasets'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_workspace_dataset_parent_change()
from public, anon, authenticated;

drop trigger if exists prevent_workspace_dataset_row_parent_change
on public.workspace_dataset_rows;

create trigger prevent_workspace_dataset_row_parent_change
before update of dataset_id
on public.workspace_dataset_rows
for each row
execute function public.prevent_workspace_dataset_parent_change();

drop trigger if exists prevent_workspace_dataset_column_parent_change
on public.workspace_dataset_columns;

create trigger prevent_workspace_dataset_column_parent_change
before update of dataset_id
on public.workspace_dataset_columns
for each row
execute function public.prevent_workspace_dataset_parent_change();
