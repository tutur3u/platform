begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

-- End-state EXECUTE ACL of the four invoice-total definers replaced in
-- 20261029040800_finance_workspace_boundaries.sql. The migration revokes
-- PUBLIC, anon and authenticated and grants service_role in a DO block before
-- the CREATE OR REPLACE statements, which preserve the ACL; the function bodies
-- also gate on auth.role() = 'service_role' (SR-843).
create temporary table invoice_total_signatures (signature text primary key)
on commit drop;

insert into invoice_total_signatures (signature)
values
  ('public.get_daily_invoice_totals(uuid,integer,uuid[],uuid[],date,date)'),
  ('public.get_monthly_invoice_totals(uuid,integer,uuid[],uuid[],date,date)'),
  ('public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date)'),
  ('public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date,integer)');

select ok(
  not exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) as acl
    where p.oid = s.signature::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  s.signature || ' has no PUBLIC EXECUTE'
)
from invoice_total_signatures s
order by s.signature;

select ok(
  not has_function_privilege('anon', s.signature, 'EXECUTE'),
  s.signature || ' is not executable by anon'
)
from invoice_total_signatures s
order by s.signature;

select ok(
  not has_function_privilege('authenticated', s.signature, 'EXECUTE'),
  s.signature || ' is not executable by authenticated'
)
from invoice_total_signatures s
order by s.signature;

select ok(
  has_function_privilege('service_role', s.signature, 'EXECUTE'),
  s.signature || ' is executable by service_role'
)
from invoice_total_signatures s
order by s.signature;

select * from finish();
rollback;
