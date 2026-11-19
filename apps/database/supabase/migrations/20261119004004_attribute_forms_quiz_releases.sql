alter table private.form_quiz_releases
  add column released_by uuid,
  add constraint form_quiz_releases_released_by_required
    check (released_by is not null) not valid;

comment on column private.form_quiz_releases.released_by is
  'Authenticated host actor recorded by the Forms service. Legacy releases retain null attribution.';
