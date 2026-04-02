begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(2);

select ok(
  exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'clear_task_projects_lead_on_member_delete'
      and p.prosecdef
  ),
  'clear_task_projects_lead_on_member_delete is SECURITY DEFINER'
);

select is(
  (
    select array_to_string(p.proconfig, ',')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'clear_task_projects_lead_on_member_delete'
  ),
  'search_path=public',
  'clear_task_projects_lead_on_member_delete pins search_path to public'
);

select * from finish();

rollback;
