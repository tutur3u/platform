begin;
drop table public.workspace_meet_settings;
drop table private.meet_ai_consents;
alter table public.meet_ai_sessions
  drop column visibility, drop column language_hint, drop column source,
  drop column notes_model, drop column notes_prompt_version,
  drop column notes_edited, drop column purge_after;
commit;
