'use client';

import { MailCheck, ShieldCheck, TimerReset } from '@tuturuuu/icons';
import type {
  TopicAnnouncementContact,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useTranslations } from 'next-intl';
import { LinkedWorkspaceUserChip } from './linked-workspace-user-chip';

function verificationVariant(
  status: TopicAnnouncementContact['verificationStatus']
) {
  if (status === 'verified' || status === 'linked_confirmed_account') {
    return 'success';
  }
  if (status === 'pending') return 'warning';
  return 'outline';
}

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

function canRequestVerification(
  status: TopicAnnouncementContact['verificationStatus']
) {
  return status === 'needs_verification';
}

interface Props {
  contacts: TopicAnnouncementContact[];
  isLoading: boolean;
  isVerifying: boolean;
  onVerify: (contactId: string) => void;
  workspaceUsersById: Map<string, WorkspaceBasicUserRecord>;
}

export function ContactTable({
  contacts,
  isLoading,
  isVerifying,
  onVerify,
  workspaceUsersById,
}: Props) {
  const t = useTranslations('ws-topic-announcements');

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('contact_name')}</TableHead>
            <TableHead>{t('email')}</TableHead>
            <TableHead>{t('verification')}</TableHead>
            <TableHead className="text-right">{t('actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading
            ? Array.from({ length: 4 }, (_, index) => (
                <TableRow key={`contact-loading-${index}`}>
                  <TableCell>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-56" />
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-28" />
                      <Skeleton className="h-3 w-64" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Skeleton className="h-8 w-32" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            : null}
          {contacts.map((contact) => (
            <TableRow key={contact.id}>
              <TableCell>
                <div className="font-medium">{contact.name}</div>
                {contact.tags.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {contact.tags.map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </TableCell>
              <TableCell>
                <div>{contact.email}</div>
                {contact.workspaceUserId ? (
                  workspaceUsersById.get(contact.workspaceUserId) ? (
                    <LinkedWorkspaceUserChip
                      user={workspaceUsersById.get(contact.workspaceUserId)!}
                    />
                  ) : (
                    <div className="mt-1 flex items-center gap-1 text-dynamic-green text-xs">
                      <ShieldCheck className="h-3 w-3" />
                      {t('linked_user')}
                    </div>
                  )
                ) : null}
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <Badge
                    variant={verificationVariant(contact.verificationStatus)}
                  >
                    {t(VERIFICATION_LABEL_KEYS[contact.verificationStatus])}
                  </Badge>
                  <p className="max-w-72 text-muted-foreground text-xs">
                    {t(VERIFICATION_HELPER_KEYS[contact.verificationStatus])}
                  </p>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  className="gap-2"
                  disabled={
                    isVerifying ||
                    !canRequestVerification(contact.verificationStatus)
                  }
                  onClick={() => onVerify(contact.id)}
                  size="sm"
                  variant={
                    contact.verificationStatus === 'pending'
                      ? 'secondary'
                      : 'outline'
                  }
                >
                  {contact.verificationStatus === 'pending' ? (
                    <TimerReset className="h-4 w-4" />
                  ) : (
                    <MailCheck className="h-4 w-4" />
                  )}
                  {contact.verificationStatus === 'pending'
                    ? t('verification_pending')
                    : t('send_verification')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!isLoading && contacts.length === 0 ? (
            <TableRow>
              <TableCell
                className="text-center text-muted-foreground"
                colSpan={4}
              >
                {t('no_contacts')}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
