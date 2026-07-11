alter table private.mail_labels
  add column description text not null default '',
  add column ai_enabled boolean not null default false,
  add column ai_auto_apply boolean not null default false,
  add column ai_instructions text not null default '';

alter table private.mail_labels
  add constraint mail_labels_description_length
    check (char_length(description) <= 500),
  add constraint mail_labels_ai_instructions_length
    check (char_length(ai_instructions) <= 4000),
  add constraint mail_labels_ai_auto_apply_requires_enabled
    check (not ai_auto_apply or ai_enabled);

create index mail_labels_mailbox_ai_enabled_idx
  on private.mail_labels (mailbox_id, ai_enabled)
  where ai_enabled;

comment on column private.mail_labels.description is
  'Human-readable purpose shown in Mail label management and supplied to AI classification.';
comment on column private.mail_labels.ai_enabled is
  'Allows this custom label to participate in mailbox-scoped AI classification.';
comment on column private.mail_labels.ai_auto_apply is
  'Allows authorized smart-label workflows to apply this label without an extra per-label confirmation.';
comment on column private.mail_labels.ai_instructions is
  'Mailbox-operator instructions defining when AI should suggest or apply the label.';
