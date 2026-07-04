'use client';

import { MailCheck, ShieldCheck, Trash2 } from '@tuturuuu/icons';
import type {
  TopicAnnouncementContact,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { TableCell, TableRow } from '@tuturuuu/ui/table';
import { useTranslations } from 'next-intl';
import {
  ContactVerificationStatus,
  canRequestContactVerification,
} from './contact-verification-status';
import { LinkedWorkspaceUserChip } from './linked-workspace-user-chip';

interface ContactRowProps {
  canSend: boolean;
  contact: TopicAnnouncementContact;
  isDeleting: boolean;
  isVerifying: boolean;
  onRemove: () => void;
  onVerify: (contactId: string) => void;
  workspaceUser?: WorkspaceBasicUserRecord;
}

export function ContactRow({
  canSend,
  contact,
  isDeleting,
  isVerifying,
  onRemove,
  onVerify,
  workspaceUser,
}: ContactRowProps) {
  const t = useTranslations('ws-topic-announcements');
  const canVerify =
    canSend && canRequestContactVerification(contact.verificationStatus);

  return (
    <TableRow>
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
          workspaceUser ? (
            <LinkedWorkspaceUserChip user={workspaceUser} />
          ) : (
            <div className="mt-1 flex items-center gap-1 text-dynamic-green text-xs">
              <ShieldCheck className="h-3 w-3" />
              {t('linked_user')}
            </div>
          )
        ) : null}
      </TableCell>
      <TableCell>
        <ContactVerificationStatus status={contact.verificationStatus} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          {canVerify ? (
            <Button
              className="gap-2"
              disabled={isVerifying}
              onClick={() => onVerify(contact.id)}
              size="sm"
              variant="outline"
            >
              <MailCheck className="h-4 w-4" />
              {t('send_verification')}
            </Button>
          ) : null}
          <Button
            aria-label={t('remove_contact_action')}
            disabled={isDeleting}
            onClick={onRemove}
            size="icon"
            title={t('remove_contact_action')}
            variant="outline"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
