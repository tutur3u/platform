begin;

select plan(2);

select ok(
  (
    select coalesce(p.proconfig, array[]::text[])
      @> array['search_path=public']
    from pg_proc p
    where p.oid =
      'public.get_task_snapshot_at_history(uuid,uuid,uuid)'::regprocedure
  ),
  'task core snapshot lookup resolves public task tables during restore'
);

select ok(
  (
    select coalesce(p.proconfig, array[]::text[])
      @> array['search_path=public']
    from pg_proc p
    where p.oid =
      'public.get_task_relationships_at_snapshot(uuid,uuid,uuid)'::regprocedure
  ),
  'task relationship snapshot lookup resolves public task tables during restore'
);

select * from finish();

rollback;
