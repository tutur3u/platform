-- Mirror the per-tier enabled flag and request limit from the generate feature.
-- Preserve any existing Cite entitlement overrides on replay.
insert into public.ai_credit_feature_access (tier, feature, enabled, max_requests_per_day)
select generation.tier, citation.feature, generation.enabled, generation.max_requests_per_day
from public.ai_credit_feature_access as generation
cross join (values
  ('cite_fix_ref'),
  ('cite_convert_style'),
  ('cite_suggest_sources'),
  ('cite_claim_check')
) as citation(feature)
where generation.feature = 'generate'
on conflict (tier, feature) do nothing;
