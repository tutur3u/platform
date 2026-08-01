UPDATE public.canonical_external_projects
SET allowed_features = ARRAY['sync', 'assets', 'delivery', 'chat']::text[]
WHERE adapter = 'cms_site'
  AND NOT ('chat' = ANY(allowed_features));
