create or replace function public.prevent_task_plan_owner_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'task plan owner cannot be changed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_task_plan_owner_change() from public;
revoke all on function public.prevent_task_plan_owner_change() from anon;
revoke all on function public.prevent_task_plan_owner_change() from authenticated;

drop trigger if exists task_plans_prevent_owner_change on public.task_plans;
create trigger task_plans_prevent_owner_change
before update on public.task_plans
for each row execute function public.prevent_task_plan_owner_change();
