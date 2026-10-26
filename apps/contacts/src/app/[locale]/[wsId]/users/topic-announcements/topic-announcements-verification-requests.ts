'use client';

import { useMutation } from '@tanstack/react-query';
import {
  InternalApiError,
  requestTopicAnnouncementContactVerification,
  type TopicAnnouncementContact,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';

export type TopicAnnouncementUnverifiedRecipient = Pick<
  TopicAnnouncementContact,
  'email' | 'id' | 'name'
>;

/** Returns the recipients named by a send blocked for unverified email, or
 * null when the error is anything else. */
export function getUnverifiedRecipientsFromError(
  error: unknown
): TopicAnnouncementUnverifiedRecipient[] | null {
  if (
    !(error instanceof InternalApiError) ||
    error.code !== 'EMAIL_NOT_VERIFIED'
  ) {
    return null;
  }
  const contacts = (error as { unverifiedContacts?: unknown })
    .unverifiedContacts;
  return Array.isArray(contacts)
    ? (contacts as TopicAnnouncementUnverifiedRecipient[])
    : [];
}

export interface TopicAnnouncementVerificationRequestSummary {
  alreadyPending: number;
  failed: number;
  rateLimited: number;
  sent: number;
}

/** Contacts that still need to click a verification link before they can
 * receive topic emails. Pending contacts are included so a resend after the
 * cooldown is possible; the server skips any still inside the cooldown. */
export function getContactsNeedingVerification(
  contacts: Pick<
    TopicAnnouncementContact,
    'archived' | 'id' | 'verificationStatus'
  >[]
) {
  return contacts.filter(
    (contact) =>
      !contact.archived &&
      (contact.verificationStatus === 'needs_verification' ||
        contact.verificationStatus === 'pending')
  );
}

/** Requests verification emails one contact at a time. Verification email is
 * rate limited per actor, so the first rate-limit response stops the run and
 * the remaining contacts are reported instead of retried. */
export async function requestTopicAnnouncementVerifications(
  contactIds: string[],
  request: (contactId: string) => Promise<{ alreadyPending?: boolean }>
): Promise<TopicAnnouncementVerificationRequestSummary> {
  const summary: TopicAnnouncementVerificationRequestSummary = {
    alreadyPending: 0,
    failed: 0,
    rateLimited: 0,
    sent: 0,
  };
  const uniqueIds = [...new Set(contactIds)];

  for (const [index, contactId] of uniqueIds.entries()) {
    try {
      const result = await request(contactId);
      if (result.alreadyPending) summary.alreadyPending += 1;
      else summary.sent += 1;
    } catch (error) {
      if (error instanceof InternalApiError && error.status === 429) {
        summary.rateLimited = uniqueIds.length - index;
        break;
      }
      summary.failed += 1;
    }
  }

  return summary;
}

export function useTopicAnnouncementVerificationRequests({
  invalidate,
  wsId,
}: {
  invalidate: () => void;
  wsId: string;
}) {
  const t = useTranslations('ws-topic-announcements');

  return useMutation({
    mutationFn: (contactIds: string[]) =>
      requestTopicAnnouncementVerifications(contactIds, (contactId) =>
        requestTopicAnnouncementContactVerification(wsId, contactId)
      ),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('verify_failed')),
    onSuccess: (summary) => {
      const message = t('verify_bulk_result', {
        pending: summary.alreadyPending.toString(),
        sent: summary.sent.toString(),
      });
      if (summary.rateLimited > 0 || summary.failed > 0) {
        toast.warning(message, {
          description: [
            summary.rateLimited > 0
              ? t('verify_bulk_rate_limited', {
                  count: summary.rateLimited.toString(),
                })
              : null,
            summary.failed > 0
              ? t('verify_bulk_failed', { count: summary.failed.toString() })
              : null,
          ]
            .filter(Boolean)
            .join(' '),
        });
      } else {
        toast.success(message);
      }
      invalidate();
    },
  });
}
