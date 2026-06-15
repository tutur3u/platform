-- Extend profile-completion links with phone support and per-link prefill
-- visibility. Existing links keep the previous behavior by default.

alter table public.workspace_user_profile_links
  add column if not exists prefill_existing_values boolean not null default true;

alter table public.workspace_user_profile_links
  drop constraint if exists workspace_user_profile_links_allowed_fields_check;

alter table public.workspace_user_profile_links
  add constraint workspace_user_profile_links_allowed_fields_check
  CHECK (
    cardinality(allowed_fields) >= 1
    AND allowed_fields <@ ARRAY[
      'display_name'::text,
      'full_name'::text,
      'birthday'::text,
      'gender'::text,
      'avatar_url'::text,
      'email'::text,
      'phone'::text
    ]
  );

create or replace view public.workspace_user_profile_links_with_stats as
SELECT
  wupl.id,
  wupl.ws_id,
  wupl.code,
  wupl.creator_id,
  wupl.mode,
  wupl.target_user_id,
  wupl.allowed_fields,
  wupl.max_uses,
  wupl.expires_at,
  wupl.revoked_at,
  wupl.created_at,
  wupl.updated_at,
  COUNT(wupls.id) as current_uses,
  CASE
    WHEN wupl.expires_at IS NOT NULL AND wupl.expires_at < now() THEN true
    ELSE false
  END as is_expired,
  CASE
    WHEN wupl.max_uses IS NOT NULL AND COUNT(wupls.id) >= wupl.max_uses THEN true
    ELSE false
  END as is_full,
  CASE
    WHEN wupl.revoked_at IS NOT NULL THEN true
    ELSE false
  END as is_revoked,
  wupl.prefill_existing_values
FROM public.workspace_user_profile_links wupl
LEFT JOIN public.workspace_user_profile_link_submissions wupls
  ON wupl.id = wupls.profile_link_id
GROUP BY
  wupl.id, wupl.ws_id, wupl.code, wupl.creator_id, wupl.mode,
  wupl.target_user_id, wupl.allowed_fields, wupl.max_uses, wupl.expires_at,
  wupl.revoked_at, wupl.created_at, wupl.updated_at,
  wupl.prefill_existing_values;

alter view public.workspace_user_profile_links_with_stats
set (security_invoker = true);

grant select on public.workspace_user_profile_links_with_stats to authenticated;
grant select on public.workspace_user_profile_links_with_stats to service_role;
