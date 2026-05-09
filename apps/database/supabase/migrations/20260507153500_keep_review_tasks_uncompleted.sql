create or replace function public.set_task_timestamps()
returns trigger as $$
declare
  new_list_status text;
begin
  if new.list_id is not null then
    select status into new_list_status
    from public.task_lists
    where id = new.list_id;

    case new_list_status
      when 'done' then
        if new.completed_at is null then
          new.completed_at = now();
        end if;
        new.completed = true;
        new.closed_at = null;

      when 'closed' then
        if new.closed_at is null then
          new.closed_at = now();
        end if;
        new.completed = false;
        new.completed_at = null;

      when 'review', 'documents', 'active', 'not_started' then
        new.completed = false;
        new.completed_at = null;
        new.closed_at = null;

      else
        new.completed = false;
        new.completed_at = null;
        new.closed_at = null;
    end case;
  end if;

  return new;
end;
$$ language plpgsql;

update public.tasks
set
  completed = false,
  completed_at = null,
  closed_at = null
from public.task_lists
where public.tasks.list_id = public.task_lists.id
  and public.task_lists.status = 'review'
  and (
    public.tasks.completed is distinct from false
    or public.tasks.completed_at is not null
    or public.tasks.closed_at is not null
  );
