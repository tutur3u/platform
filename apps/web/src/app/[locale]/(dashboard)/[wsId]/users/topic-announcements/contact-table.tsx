'use client';

import { MailCheck } from '@tuturuuu/icons';
import type { TopicAnnouncementContact } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useTranslations } from 'next-intl';

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

interface Props {
  contacts: TopicAnnouncementContact[];
  isLoading: boolean;
  isVerifying: boolean;
  onVerify: (contactId: string) => void;
}

export function ContactTable({
  contacts,
  isLoading,
  isVerifying,
  onVerify,
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
          {contacts.map((contact) => (
            <TableRow key={contact.id}>
              <TableCell>{contact.name}</TableCell>
              <TableCell>{contact.email}</TableCell>
              <TableCell>
                <Badge
                  variant={verificationVariant(contact.verificationStatus)}
                >
                  {t(VERIFICATION_LABEL_KEYS[contact.verificationStatus])}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  className="gap-2"
                  disabled={
                    isVerifying ||
                    contact.verificationStatus === 'verified' ||
                    contact.verificationStatus === 'linked_confirmed_account'
                  }
                  onClick={() => onVerify(contact.id)}
                  size="sm"
                  variant="outline"
                >
                  <MailCheck className="h-4 w-4" />
                  {t('send_verification')}
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
