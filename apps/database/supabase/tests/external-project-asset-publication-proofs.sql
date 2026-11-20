begin;
select plan(8);

select ok(
  (select relrowsecurity from pg_class
    where oid = 'private.external_project_asset_publication_proofs'::regclass),
  'publication proofs have row-level security'
);
select ok(
  not has_table_privilege('anon', 'private.external_project_asset_publication_proofs', 'SELECT'),
  'anonymous clients cannot read proof storage'
);
select ok(
  not has_table_privilege('authenticated', 'private.external_project_asset_publication_proofs', 'INSERT'),
  'authenticated publishers cannot insert proofs'
);
select ok(
  not has_table_privilege('authenticated', 'private.external_project_asset_publication_proofs', 'UPDATE'),
  'authenticated publishers cannot update proofs'
);
select ok(
  not has_table_privilege('authenticated', 'private.external_project_asset_publication_proofs', 'DELETE'),
  'authenticated publishers cannot delete proofs'
);
select ok(
  has_schema_privilege('service_role', 'private', 'USAGE'),
  'the service role can address the proof schema'
);
select ok(
  has_table_privilege('service_role', 'private.external_project_asset_publication_proofs', 'SELECT') and
  has_table_privilege('service_role', 'private.external_project_asset_publication_proofs', 'INSERT'),
  'the publish service can record and read proofs'
);
select ok(
  not has_table_privilege('service_role', 'private.external_project_asset_publication_proofs', 'UPDATE'),
  'recorded proofs are append-only for the service role'
);

select * from finish();
rollback;
