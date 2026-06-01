begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(7);

select ok(
  to_regprocedure(
    'private.get_finance_overview_metrics(uuid,uuid,text,date,date,boolean)'
  ) is not null,
  'private finance overview metrics RPC exists'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.get_finance_overview_metrics(uuid,uuid,text,date,date,boolean)',
    'execute'
  ),
  'service role can execute finance overview metrics RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.get_finance_overview_metrics(uuid,uuid,text,date,date,boolean)',
    'execute'
  ),
  'authenticated users cannot execute finance overview metrics RPC directly'
);

select ok(
  position(
    'view_finance_stats' in pg_get_functiondef(
      to_regprocedure(
        'private.get_finance_overview_metrics(uuid,uuid,text,date,date,boolean)'
      )
    )
  ) > 0,
  'finance overview metrics RPC enforces view_finance_stats'
);

select ok(
  position(
    '''manage_finance''' in pg_get_functiondef(
      to_regprocedure(
        'private.get_finance_overview_metrics(uuid,uuid,text,date,date,boolean)'
      )
    )
  ) = 0,
  'finance overview metrics RPC does not require manage_finance'
);

select ok(
  position(
    'private.workspace_wallets' in pg_get_functiondef(
      to_regprocedure(
        'private.get_finance_overview_metrics(uuid,uuid,text,date,date,boolean)'
      )
    )
  ) > 0,
  'finance overview metrics RPC reads private workspace wallets'
);

select ok(
  position(
    'public.workspace_wallets' in pg_get_functiondef(
      to_regprocedure(
        'private.get_finance_overview_metrics(uuid,uuid,text,date,date,boolean)'
      )
    )
  ) = 0,
  'finance overview metrics RPC does not read removed public workspace wallets'
);

select * from finish();

rollback;
