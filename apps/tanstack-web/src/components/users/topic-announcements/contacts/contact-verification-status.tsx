'use client';

import type { TopicAnnouncementContact } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';
import { TopicAnnouncementsHelpTip } from './topic-announcements-help-tip';

const VERIFICATION_LABEL_KEYS = {
  linked_confirmed_account: 'verification_linked_confirmed_account',
  needs_verification: 'verification_needs_verification',
  pending: 'verification_pending',
  verified: 'verification_verified',
} as const;

const VERIFICATION_HELPER_KEYS = {
  linked_confirmed_account: 'verification_linked_helper',
  needs_verification: 'verification_needed_helper',
  pending: 'verification_pending_helper',
  verified: 'verification_verified_helper',
} as const;

export function canRequestContactVerification(
  status: TopicAnnouncementContact['verificationStatus']
) {
  return status === 'needs_verification';
}

function verificationVariant(
  status: TopicAnnouncementContact['verificationStatus']
) {
  if (status === 'verified' || status === 'linked_confirmed_account') {
    return 'success';
  }
  if (status === 'pending') return 'warning';
  return 'outline';
}

interface ContactVerificationStatusProps {
  status: TopicAnnouncementContact['verificationStatus'];
}

export function ContactVerificationStatus({
  status,
}: ContactVerificationStatusProps) {
  const t = useTranslations('ws-topic-announcements');
  const canVerify = canRequestContactVerification(status);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Badge variant={verificationVariant(status)}>
          {t(VERIFICATION_LABEL_KEYS[status])}
        </Badge>
        {canVerify ? null : (
          <TopicAnnouncementsHelpTip
            label={t(VERIFICATION_HELPER_KEYS[status])}
          />
        )}
      </div>
      {canVerify ? (
        <p className="max-w-72 text-muted-foreground text-xs">
          {t(VERIFICATION_HELPER_KEYS[status])}
        </p>
      ) : null}
    </div>
  );
}
