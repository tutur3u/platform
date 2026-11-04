begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok((select prosecdef and pg_get_userbyid(proowner) = 'postgres'
    and proconfig @> array['search_path=pg_catalog, pg_temp']
    from pg_proc where oid = to_regprocedure('private.enforce_azure_identity_link_verification()')),
    'SR-354: trigger definer has postgres owner and pinned search path');
select ok(not has_function_privilege('anon', to_regprocedure('private.enforce_azure_identity_link_verification()'), 'execute'),
    'SR-354: anon cannot execute trigger helper');
select ok(not has_function_privilege('authenticated', to_regprocedure('private.enforce_azure_identity_link_verification()'), 'execute'),
    'SR-354: authenticated cannot execute trigger helper');
select ok(not exists(
    select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = to_regprocedure('private.enforce_azure_identity_link_verification()')
        and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
    'SR-354: PUBLIC cannot execute trigger helper');
select * from finish();
rollback;
