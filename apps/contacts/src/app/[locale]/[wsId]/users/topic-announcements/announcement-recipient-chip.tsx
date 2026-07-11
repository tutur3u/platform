'use client';

import type { TopicAnnouncementContact } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';

const VERIFICATION_LABEL_KEYS = {
  linked_confirmed_account: 'verification_linked_confirmed_account',
  needs_verification: 'verification_needs_verification',
  pending: 'verification_pending',
  verified: 'verification_verified',
} as const;

function isReadyRecipient(contact: TopicAnnouncementContact) {
  return ['verified', 'linked_confirmed_account'].includes(
    contact.verificationStatus
  );
}

interface Props {
  contact: TopicAnnouncementContact;
}

export function AnnouncementRecipientChip({ contact }: Props) {
  const t = useTranslations('ws-topic-announcements');
  const ready = isReadyRecipient(contact);

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-foreground/5 px-2 py-1">
      <span className="min-w-0">
        <span className="block truncate font-medium text-xs">
          {contact.name}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {contact.email}
        </span>
      </span>
      {!ready ? (
        <Badge className="shrink-0" variant="warning">
          {t(VERIFICATION_LABEL_KEYS[contact.verificationStatus])}
        </Badge>
      ) : (
        <Badge className="shrink-0" variant="success">
          {t(VERIFICATION_LABEL_KEYS[contact.verificationStatus])}
        </Badge>
      )}
    </div>
  );
}
