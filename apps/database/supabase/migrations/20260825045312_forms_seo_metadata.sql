-- Per-form SEO and social-sharing metadata.
--
-- Until now every public form at `/f/<shareCode>` derived its title, social
-- description and Open Graph image from the form's own content. That is a fine
-- default but not controllable: a form titled "Q3 intake — v2 (FINAL)" reads
-- badly as a link preview, and there was no way to keep a public form out of
-- search results short of leaving it unpublished.
--
-- Stored as a single jsonb column, matching the existing `settings` and `theme`
-- columns on this table, so adding a field later does not need a migration.
-- Shape (all keys optional, empty string/false means "fall back to derived"):
--
--   {
--     "title":         text,     -- overrides the derived social/page title
--     "description":   text,     -- overrides the derived description
--     "image":         { "storagePath": text, "url": text, "alt": text },
--     "keywords":      text[],   -- replaces the derived keyword list
--     "canonicalUrl":  text,     -- points crawlers at a different canonical
--     "noIndex":       boolean   -- emits robots noindex,nofollow
--   }

alter table if exists private.forms
  add column if not exists seo jsonb not null default '{}'::jsonb;

comment on column private.forms.seo is
  'Optional per-form SEO/social overrides. Empty object means every field is derived from the form content. See the migration that introduced this column for the shape.';

-- Guard against a non-object landing here (an array or scalar would silently
-- break every read path, which merges this column into a Zod object schema).
alter table if exists private.forms
  drop constraint if exists forms_seo_is_object;

alter table if exists private.forms
  add constraint forms_seo_is_object
  check (jsonb_typeof(seo) = 'object');
