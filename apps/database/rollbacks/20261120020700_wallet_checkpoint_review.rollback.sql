drop function private.set_wallet_checkpoint_review(
  uuid, uuid, uuid, uuid, timestamptz, boolean
);
drop trigger invalidate_wallet_checkpoint_review
  on private.workspace_wallet_checkpoints;
drop function private.invalidate_wallet_checkpoint_review();
alter table private.workspace_wallet_checkpoints
  drop column reviewed_by,
  drop column reviewed_at;
