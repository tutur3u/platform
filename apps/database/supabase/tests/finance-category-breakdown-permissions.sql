begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(8);

select ok(
  to_regprocedure(
    'private.get_category_breakdown(uuid,uuid,timestamptz,timestamptz,boolean,text,text,boolean,text,uuid[])'
  ) is not null,
  'private category breakdown RPC exists'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.get_category_breakdown(uuid,uuid,timestamptz,timestamptz,boolean,text,text,boolean,text,uuid[])',
    'execute'
  ),
  'service role can execute the app-session category breakdown RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.get_category_breakdown(uuid,uuid,timestamptz,timestamptz,boolean,text,text,boolean,text,uuid[])',
    'execute'
  ),
  'authenticated callers cannot invoke the private RPC directly'
);

select ok(
  position(
    '''view_finance_stats''' in pg_get_functiondef(
      'private.get_category_breakdown(uuid,uuid,timestamptz,timestamptz,boolean,text,text,boolean,text,uuid[])'::regprocedure
    )
  ) > 0,
  'finance-stat viewers retain category breakdown access'
);

select ok(
  position(
    '''view_transactions''' in pg_get_functiondef(
      'private.get_category_breakdown(uuid,uuid,timestamptz,timestamptz,boolean,text,text,boolean,text,uuid[])'::regprocedure
    )
  ) > 0,
  'transaction viewers can load category breakdowns embedded in transaction pages'
);

select ok(
  position(
    'assert_finance_chart_date_range' in pg_get_functiondef(
      'private.get_category_breakdown(uuid,uuid,timestamptz,timestamptz,boolean,text,text,boolean,text,uuid[])'::regprocedure
    )
  ) > 0,
  'the private app-session path enforces the finance chart date-range budget'
);

select ok(
  position(
    'public.workspace_wallets' in pg_get_functiondef(
      'private.get_category_breakdown(uuid,uuid,timestamptz,timestamptz,boolean,text,text,boolean,text,uuid[])'::regprocedure
    )
  ) = 0,
  'category breakdown does not regress to the removed public wallet table'
);

select is(
  (
    select config
    from pg_proc procedure
    cross join lateral unnest(procedure.proconfig) config
    where procedure.oid =
      'private.get_category_breakdown(uuid,uuid,timestamptz,timestamptz,boolean,text,text,boolean,text,uuid[])'::regprocedure
      and config like 'search_path=%'
  ),
  'search_path=private, public, pg_temp',
  'category breakdown resolves the private wallet schema first'
);

select * from finish();

rollback;
