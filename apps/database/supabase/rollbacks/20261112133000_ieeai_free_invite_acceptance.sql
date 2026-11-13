-- Disable the consumer before this rollback. Retain immutable acceptance evidence.
DROP FUNCTION IF EXISTS private.accept_ieeai_free_workspace_invite(text, uuid, uuid, uuid[]);
-- Keep private.ieeai_invite_acceptances and its denied direct-access ACLs.
-- Reapply the proposal only after checking this retained table's definition.
