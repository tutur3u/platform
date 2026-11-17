-- Disable the Mail block and contact-link consumers before this rollback.
-- Dropping private.mail_sender_blocks discards block rules; blocked messages
-- keep their `blocked` label and stay in place (nothing is deleted).
DROP TRIGGER IF EXISTS guard_workspace_user_mail_blocked ON public.workspace_users;
DROP FUNCTION IF EXISTS public.guard_workspace_user_mail_blocked();
ALTER TABLE public.workspace_users DROP COLUMN IF EXISTS mail_blocked;
DROP TABLE IF EXISTS private.mail_sender_blocks;
DROP FUNCTION IF EXISTS private.link_personal_mailbox_workspaces(uuid);
DROP INDEX IF EXISTS private.mail_mailboxes_ws_id_idx;
ALTER TABLE private.mail_mailboxes DROP COLUMN IF EXISTS ws_id;
