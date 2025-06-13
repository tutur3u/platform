-- Drop the existing view
drop view if exists public.workspace_dataset_row_cells;

-- Recreate the view with created_at
create view
  public.workspace_dataset_row_cells with (security_invoker=on) as
select
  wdr.id as row_id,
  wdr.dataset_id,
  wdr.created_at,
  jsonb_object_agg(wdc.name, wdc.data) as cells
from
  workspace_dataset_rows wdr
  left join lateral (
    select
      c.data,
      col.name
    from
      workspace_dataset_cells c
      join workspace_dataset_columns col on col.id = c.column_id
    where
      c.row_id = wdr.id
  ) wdc on true
group by
  wdr.id,
  wdr.dataset_id,
  wdr.created_at;
