alter table public.abuse_trust_overrides enable row level security;

drop policy if exists "Allow root workspace users to manage abuse trust overrides"
on public.abuse_trust_overrides;

revoke all on table public.abuse_trust_overrides from anon, authenticated;

grant select, insert, update, delete on table public.abuse_trust_overrides
to service_role;
