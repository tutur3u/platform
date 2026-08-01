UPDATE public.canonical_external_projects
SET allowed_features = array_append(allowed_features, 'chat')
WHERE adapter = 'cms_site'
  AND NOT ('chat' = ANY(allowed_features));
