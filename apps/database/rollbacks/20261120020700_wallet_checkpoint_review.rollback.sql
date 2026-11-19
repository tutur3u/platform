-- This rollback discards the checkpoint review state (reviewed_at and
-- reviewed_by). The audit log is the only remaining copy.

drop trigger if exists invalidate_wallet_checkpoint_review
  on private.workspace_wallet_checkpoints;
drop function if exists private.invalidate_wallet_checkpoint_review();
drop function if exists private.set_wallet_checkpoint_review(
  uuid, uuid, uuid, uuid, timestamptz, boolean
);
alter table private.workspace_wallet_checkpoints
  drop column if exists reviewed_by,
  drop column if exists reviewed_at;
