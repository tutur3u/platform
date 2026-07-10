import type {
  MailLabel as InternalMailLabel,
  MailAttachment,
  MailBootstrapResponse,
  MailMailbox,
  MailMailboxMember,
  MailMailboxRole,
  MailMessageDetail,
  MailMessageSummary,
  MailRecipient,
} from '@tuturuuu/internal-api';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export type {
  MailAttachment,
  MailBootstrapResponse,
  MailMailbox,
  MailMailboxMember,
  MailMailboxRole,
  MailMessageDetail,
  MailMessageSummary,
  MailRecipient,
};

export type MailLabel = InternalMailLabel & { mailboxId: string };
export type ListMailMessagesParams =
  import('@tuturuuu/internal-api').ListMailMessagesParams & {
    folderId?: string;
  };
export type MailFolderDefinition = {
  id: string;
  kind: 'custom' | 'system';
  mailboxId: string;
  name: string;
  slug: string;
};
export type BulkUpdateMailPayload = {
  action:
    | import('@tuturuuu/internal-api').UpdateMailMessageStatePayload['action']
    | 'add_label'
    | 'clear_folder'
    | 'move_to_folder'
    | 'remove_label';
  folderId?: string;
  labelId?: string;
  messageIds: string[];
};
export type CreateMailOrganizationPayload = {
  color?: string | null;
  name: string;
};
export type UpdateMailOrganizationPayload = {
  color?: string | null;
  name?: string;
};
export type MailThread = {
  id: string;
  lastMessageAt: string | null;
  mailboxId: string;
  messageCount: number;
  status: 'active' | 'archived' | 'spam' | 'trash';
  subject: string;
  unreadCount: number;
};
export type MailThreadDetail = {
  messages: MailMessageDetail[];
  thread: MailThread;
};

export type MailRouteContext = {
  normalizedWsId: string;
  supabase: TypedSupabaseClient;
  user: {
    email?: string | null;
    id: string;
  };
};

export type MailboxAccess = {
  mailbox: MailMailbox;
  role: MailMailboxRole;
};
