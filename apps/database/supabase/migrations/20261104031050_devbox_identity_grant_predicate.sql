-- Shared prerequisite for SR-332/333/334 and contributor identity S1.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
alter table private.devbox_control_settings
    add column if not exists personal_pools_enabled boolean not null default false;

create table if not exists private.devbox_personal_pool_grants (
    user_id uuid primary key references public.users(id) on delete cascade,
    status text not null default 'pending'
        check (status in ('pending', 'active', 'suspended', 'revoked', 'expired')),
    accepted_at timestamptz,
    expires_at timestamptz not null,
    suspended boolean not null default false
);
alter table private.devbox_personal_pool_grants enable row level security;
revoke all on private.devbox_personal_pool_grants from public, anon, authenticated;
grant select on private.devbox_personal_pool_grants to service_role;

create or replace function private.devbox_identity_grant_active(p_user_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp as $$
    select exists (
        select 1 from private.devbox_personal_pool_grants g
        join private.devbox_control_settings s on s.id
        where g.user_id = p_user_id and s.personal_pools_enabled
            and g.status = 'active' and g.accepted_at <= now()
            and g.expires_at > now() and not g.suspended
            and not exists (
                select 1 from public.workspace_members m
                where m.user_id = p_user_id
                    and m.ws_id = '00000000-0000-0000-0000-000000000000'::uuid
                    and m.type = 'MEMBER'
            )
    );
$$;
revoke all on function private.devbox_identity_grant_active(uuid) from public, anon, authenticated;
grant execute on function private.devbox_identity_grant_active(uuid) to service_role;
commit;
