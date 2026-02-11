-- Add view for dataset rows with cells
create view workspace_dataset_row_cells as
select
    wdr.id as row_id,
    wdr.dataset_id,
    jsonb_object_agg(wdc.name, wdc.data) as cells
from
    workspace_dataset_rows wdr
    left join lateral (
        select
            c.data,
            col.name
        from
            workspace_dataset_cell c
            join workspace_dataset_columns col on col.id = c.column_id
        where
            c.row_id = wdr.id
    ) wdc on true
group by
    wdr.id,
    wdr.dataset_id;

-- Grant permissions on the view
grant
select
    on workspace_dataset_row_cells to anon;

grant
select
    on workspace_dataset_row_cells to authenticated;

grant
select
    on workspace_dataset_row_cells to service_role;