-- The newsletter_sending feature flag is config tier in the workspace
-- secrets tier mirror, matched exactly and case-sensitively, like its
-- TypeScript rule.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);

select is(private.workspace_secret_name_tier('newsletter_sending'), 'config',
  'newsletter_sending is config tier');
select is(private.workspace_secret_name_tier('  newsletter_sending  '), 'config',
  'surrounding whitespace is ignored, as in the TypeScript policy');
select is(private.workspace_secret_name_tier('NEWSLETTER_SENDING'), 'credential',
  'matching is case-sensitive, as in the TypeScript policy');
select is(
  (select row(priority, kind, tier, client_visible, value_type)::text
   from private.workspace_secret_name_tiers where match = 'newsletter_sending'),
  row(350, 'exact', 'config', true, 'boolean')::text,
  'the row equals the TypeScript rule');
select is(
  (select count(*)::int from private.workspace_secret_name_tiers where match = 'newsletter_sending'),
  1, 'the flag has exactly one rule');

select is(private.workspace_secret_name_tier('ENABLE_X'), 'config',
  'a seeded prefix rule still resolves unchanged');
select is(
  (select row(priority, kind, match, tier, client_visible, value_type)::text
   from private.workspace_secret_name_tiers where priority = 340),
  row(340, 'prefix', 'INVITE_RATE_LIMIT_', 'config', true, 'number')::text,
  'the last seeded rule keeps its priority');

select * from finish();
rollback;
