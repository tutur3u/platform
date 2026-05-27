import type {
  MailAttachment,
  MailBootstrapResponse,
  MailLabel,
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
  MailLabel,
  MailMailbox,
  MailMailboxMember,
  MailMailboxRole,
  MailMessageDetail,
  MailMessageSummary,
  MailRecipient,
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
