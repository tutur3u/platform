drop trigger if exists enforce_single_closed_list on public.task_lists;

drop function if exists public.ensure_single_closed_list();

update public.task_board_status_templates
set statuses = (
  select jsonb_agg(
    case
      when status_item->>'status' = 'closed' then
        jsonb_set(status_item, '{allow_multiple}', 'true'::jsonb, true)
      else status_item
    end
  )
  from jsonb_array_elements(statuses) as status_item
)
where statuses @> '[{"status":"closed"}]'::jsonb;
