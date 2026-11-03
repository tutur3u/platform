-- Read-only catalog audit. Run with psql -X -v ON_ERROR_STOP=1 on an isolated
-- fully migrated local database. Candidates require ownership/retention review;
-- a co-cascade path can remove referencing rows before a NO ACTION check.
begin;
create temporary view workspace_delete_reachable as
with recursive parents(relid) as (
  select 'public.workspaces'::regclass::oid
  union
  select c.conrelid
  from pg_constraint c join parents p on p.relid = c.confrelid
  where c.contype = 'f'
)
select relid from parents;

select count(*) as reachable_tables from workspace_delete_reachable;

select c.conrelid::regclass as child, c.conname,
  c.confrelid::regclass as parent, pg_get_constraintdef(c.oid) as definition,
  c.convalidated, array_agg(a.attname order by k.ordinality) as columns,
  bool_or(a.attnotnull and (
    c.confdelsetcols is null or a.attnum = any(c.confdelsetcols)
  )) as any_delete_target_not_null
from pg_constraint c
join workspace_delete_reachable p on p.relid = c.confrelid
cross join lateral unnest(c.conkey) with ordinality k(attnum, ordinality)
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
where c.contype = 'f'
group by c.oid
having c.confdeltype in ('a', 'r') or (
  c.confdeltype = 'n' and bool_or(a.attnotnull and (
    c.confdelsetcols is null or a.attnum = any(c.confdelsetcols)
  ))
)
order by c.conrelid::regclass::text, c.conname;

-- Inspect all non-internal DELETE triggers, not just BEFORE ROW triggers.
-- Definitions expose conditional raises and parent-removal escape branches.
select t.tgrelid::regclass as table_name, t.tgname,
  pg_get_triggerdef(t.oid) as trigger_definition,
  t.tgfoid::regprocedure as function_name,
  pg_get_functiondef(t.tgfoid) as function_definition
from pg_trigger t
join workspace_delete_reachable p on p.relid = t.tgrelid
where not t.tgisinternal and (t.tgtype::integer & 8) <> 0
order by t.tgrelid::regclass::text, t.tgname;

-- Policy expressions and their direct function dependencies. A policy can
-- deny a caller without raising; admin/service bypass does not prove client RLS.
select p.polrelid::regclass as table_name, p.polname, p.polcmd,
  pg_get_expr(p.polqual, p.polrelid) as using_expression,
  f.oid::regprocedure as directly_called_function,
  case when f.oid is not null then pg_get_functiondef(f.oid) end as definition
from pg_policy p
join workspace_delete_reachable r on r.relid = p.polrelid
left join pg_depend d on d.classid = 'pg_policy'::regclass
  and d.objid = p.oid and d.refclassid = 'pg_proc'::regclass
left join pg_proc f on f.oid = d.refobjid
where p.polcmd in ('d', '*')
order by p.polrelid::regclass::text, p.polname, f.oid;
rollback;
