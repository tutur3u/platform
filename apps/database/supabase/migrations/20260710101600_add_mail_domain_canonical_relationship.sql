-- Allow a verified Cloudflare ingress-only domain to deliver into mailboxes
-- owned by a different canonical domain. This supports a reversible Google
-- Workspace shadow-delivery phase without changing the production MX records.

alter table private.mail_domains
  add column canonical_domain_id uuid
    references private.mail_domains(id) on delete restrict,
  add constraint mail_domains_canonical_domain_not_self
    check (canonical_domain_id is null or canonical_domain_id <> id);

create index mail_domains_canonical_domain_idx
  on private.mail_domains (canonical_domain_id)
  where canonical_domain_id is not null;

insert into private.mail_domains (
  domain,
  status,
  inbound_provider,
  outbound_provider,
  cloudflare_account_id,
  cloudflare_zone_id,
  canonical_domain_id,
  verification_state,
  operational_metadata,
  verified_at
)
select
  'ingest.tutur3u.com',
  'active',
  'cloudflare',
  'ses',
  'e8912e2867beecc673d171907bf09649',
  '2b22027ddc66d3e5e890b2303a6788c7',
  canonical.id,
  '{"email_routing": "verified", "shadow_delivery": true}'::jsonb,
  '{"purpose": "google_workspace_shadow_ingress", "source": "add_mail_domain_canonical_relationship"}'::jsonb,
  now()
from private.mail_domains as canonical
where canonical.domain = 'tuturuuu.com'
on conflict (domain) do update
set
  status = excluded.status,
  inbound_provider = excluded.inbound_provider,
  cloudflare_account_id = excluded.cloudflare_account_id,
  cloudflare_zone_id = excluded.cloudflare_zone_id,
  canonical_domain_id = excluded.canonical_domain_id,
  verification_state = private.mail_domains.verification_state || excluded.verification_state,
  operational_metadata = private.mail_domains.operational_metadata || excluded.operational_metadata,
  verified_at = excluded.verified_at;
