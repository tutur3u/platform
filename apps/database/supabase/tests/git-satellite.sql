begin;

select plan(12);

select has_enum(
  'public',
  'workspace_role_permission',
  'workspace_role_permission exists'
);

select ok(
  exists (
    select 1
    from pg_enum
    where enumtypid = 'public.workspace_role_permission'::regtype
      and enumlabel = 'manage_git_repositories'
  ),
  'workspace_role_permission contains the Git administration permission'
);

select has_table('private', 'git_app_configurations', 'GitHub App config is private');
select has_table('private', 'git_repositories', 'Git repository registry is private');
select has_table('private', 'git_audit_events', 'Git audit trail is private');

select has_column(
  'private',
  'git_app_configurations',
  'private_key_encrypted',
  'GitHub App private key is stored encrypted'
);
select has_column(
  'private',
  'git_repositories',
  'github_repository_id',
  'repository registry stores the GitHub repository id'
);
select has_column(
  'private',
  'git_repositories',
  'visibility',
  'repository registry stores visibility'
);

select results_eq(
  $$
    select owner_login || '/' || name
    from private.git_repositories
    where github_repository_id = 536896722
  $$,
  array['tutur3u/platform'],
  'tutur3u/platform is registered by default'
);

select results_eq(
  $$
    select visibility
    from private.git_repositories
    where github_repository_id = 536896722
  $$,
  array['public'],
  'the default repository is public'
);

select throws_ok(
  $$
    insert into private.git_repositories (
      github_repository_id,
      owner_login,
      name,
      visibility
    ) values (1, 'tutur3u', 'private-test', 'private')
  $$,
  '23514',
  null,
  'private repositories are rejected'
);

select throws_ok(
  $$
    insert into private.git_app_configurations (
      id,
      app_id,
      installation_id,
      data_key_ciphertext,
      private_key_encrypted,
      private_key_fingerprint
    ) values ('secondary', '1', '1', 'key', 'secret', 'fingerprint')
  $$,
  '23514',
  null,
  'only the primary GitHub App configuration is accepted'
);

select * from finish();
rollback;
