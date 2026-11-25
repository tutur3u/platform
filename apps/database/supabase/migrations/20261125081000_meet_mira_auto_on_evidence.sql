begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table private.meet_mira_participant_choices
  drop constraint meet_mira_participant_choices_source_check,
  add constraint meet_mira_participant_choices_source_check
    check (
      source in ('join', 'confirm', 'toggle', 'system_fallback')
      or (source = 'auto_on' and choice = 'on' and not guest and acceptance_revision > 0)
    ) not valid;

alter table private.meet_mira_participant_choices
  validate constraint meet_mira_participant_choices_source_check;

commit;
