begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Exercise GoTrue auth-table row shapes; all fixture writes roll back.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
    ('35400000-0000-4000-8000-000000000001', 'azure-link@example.test', '{}', '{}'),
    ('35400000-0000-4000-8000-000000000002', 'azure-signup@example.test', '{}', '{}');

insert into auth.identities (id, user_id, provider_id, provider, identity_data)
values (gen_random_uuid(), '35400000-0000-4000-8000-000000000001',
    '35400000-0000-4000-8000-000000000001', 'email',
    '{"sub":"35400000-0000-4000-8000-000000000001","email":"azure-link@example.test","email_verified":true}');

select throws_ok(
    format($q$insert into auth.identities (id, user_id, provider_id, provider, identity_data)
        values (gen_random_uuid(), '35400000-0000-4000-8000-000000000001', %L, 'azure', %L::jsonb)$q$,
        'azure-denied-' || label,
        jsonb_build_object('sub', 'azure-denied-' || label, 'email', 'azure-link@example.test') || claims),
    '42501', 'Microsoft identity linking requires verified email',
    'SR-354: reject Azure link with ' || label)
from (values
    ('no verification claim', '{}'::jsonb),
    ('email_verified alone', '{"email_verified":true}'),
    ('false xms_edov despite email_verified', '{"email_verified":true,"custom_claims":{"xms_edov":false}}'),
    ('null xms_edov', '{"custom_claims":{"xms_edov":null}}'),
    ('numeric xms_edov', '{"custom_claims":{"xms_edov":1}}'),
    ('unrecognized xms_edov string', '{"custom_claims":{"xms_edov":"yes"}}'),
    ('unproven top-level claim', '{"xms_edov":true,"email_verified":true}')
) as invalid(label, claims);

select is((select count(*) from auth.identities
    where user_id = '35400000-0000-4000-8000-000000000001' and provider = 'azure'),
    0::bigint, 'SR-354: rejected links leave no Azure identity');

select lives_ok(
    format($q$insert into auth.identities (id, user_id, provider_id, provider, identity_data)
        values (gen_random_uuid(), '35400000-0000-4000-8000-000000000001', %L, 'azure', %L::jsonb)$q$,
        'azure-allowed-' || label,
        jsonb_build_object('sub', 'azure-allowed-' || label, 'email', 'azure-link@example.test',
            'email_verified', true, 'custom_claims', jsonb_build_object('xms_edov', claim))),
    'SR-354: allow Azure link with explicit ' || label)
from (values
    ('boolean true', 'true'::jsonb),
    ('string true', '"true"'::jsonb),
    ('string one', '"1"'::jsonb)
) as verified(label, claim);

select throws_ok($q$
    insert into auth.identities (id, user_id, provider_id, provider, identity_data)
    values (gen_random_uuid(), '35400000-0000-4000-8000-000000000001',
        'azure-another-subject', 'azure', '{"sub":"azure-another-subject","email":"azure-link@example.test"}')
$q$, '42501', 'Microsoft identity linking requires verified email',
    'SR-354: an existing Azure identity does not authorize a different Azure subject');

select lives_ok($q$
    insert into auth.identities (id, user_id, provider_id, provider, identity_data)
    values (gen_random_uuid(), '35400000-0000-4000-8000-000000000002',
        'azure-new', 'azure', '{"sub":"azure-new","email":"azure-signup@example.test"}')
$q$, 'SR-354: allow new Azure-only signup without verification claim');

select lives_ok(
    format($q$insert into auth.identities (id, user_id, provider_id, provider, identity_data)
        values (gen_random_uuid(), '35400000-0000-4000-8000-000000000001', %L, %L, %L::jsonb)$q$,
        'other-' || provider, provider,
        jsonb_build_object('sub', 'other-' || provider, 'email', 'azure-link@example.test')),
    'SR-354: preserve unverified ' || provider || ' linking')
from (values ('google'), ('github')) as other(provider);

select lives_ok($q$
    update auth.identities set identity_data = '{"sub":"azure-allowed-boolean true","email":"azure-link@example.test"}',
        last_sign_in_at = now()
    where user_id = '35400000-0000-4000-8000-000000000001'
        and provider = 'azure' and provider_id = 'azure-allowed-boolean true'
$q$, 'SR-354: existing Azure signin updates without verification claim');
select is((select identity_data ? 'custom_claims' from auth.identities
    where provider = 'azure' and provider_id = 'azure-allowed-boolean true'),
    false, 'SR-354: existing identity update actually persisted');

select * from finish();
rollback;
