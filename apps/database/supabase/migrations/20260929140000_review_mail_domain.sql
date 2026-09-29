-- The routed reviewer identity needs its own personal Mail domain. Keep this
-- domain separate from staff mailboxes and do not change existing catch-all
-- or canonical-domain routing.
insert into private.mail_domains (
  domain,
  status,
  inbound_provider,
  outbound_provider,
  verification_state,
  operational_metadata,
  verified_at
)
values (
  'tutur3u.com',
  'active',
  'cloudflare',
  'ses',
  '{"email_routing": "verified"}'::jsonb,
  '{"purpose": "isolated_app_review_mailbox", "source": "review_mail_domain"}'::jsonb,
  now()
)
on conflict (domain) do nothing;
