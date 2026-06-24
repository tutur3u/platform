'use client';

import { MailCheck, Plus } from '@tuturuuu/icons';
import type {
  TopicAnnouncementContact,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
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
import { useState } from 'react';
import { ContactDeleteDialog } from './contact-delete-dialog';
import { ContactLoadingRows } from './contact-loading-rows';
import { ContactRow } from './contact-row';
import { TopicAnnouncementsEmptyState } from './topic-announcements-empty-state';

interface ContactTableProps {
  canSend: boolean;
  contacts: TopicAnnouncementContact[];
  isDeleting: boolean;
  isLoading: boolean;
  isVerifying: boolean;
  onAddContact: () => void;
  onDelete: (contactId: string) => void;
  onVerify: (contactId: string) => void;
  workspaceUsersById: Map<string, WorkspaceBasicUserRecord>;
}

export function ContactTable({
  canSend,
  contacts,
  isDeleting,
  isLoading,
  isVerifying,
  onAddContact,
  onDelete,
  onVerify,
  workspaceUsersById,
}: ContactTableProps) {
  const t = useTranslations('ws-topic-announcements');
  const [removeTarget, setRemoveTarget] =
    useState<TopicAnnouncementContact | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-md border bg-background">
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
            {isLoading ? <ContactLoadingRows /> : null}
            {contacts.map((contact) => (
              <ContactRow
                canSend={canSend}
                contact={contact}
                isDeleting={isDeleting}
                isVerifying={isVerifying}
                key={contact.id}
                onRemove={() => setRemoveTarget(contact)}
                onVerify={onVerify}
                workspaceUser={
                  contact.workspaceUserId
                    ? workspaceUsersById.get(contact.workspaceUserId)
                    : undefined
                }
              />
            ))}
            {!isLoading && contacts.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="p-0" colSpan={4}>
                  <TopicAnnouncementsEmptyState
                    action={
                      <Button
                        className="gap-2"
                        onClick={onAddContact}
                        size="sm"
                        type="button"
                      >
                        <Plus className="h-4 w-4" />
                        {t('add_contact')}
                      </Button>
                    }
                    className="border-0"
                    description={t('contacts_empty_desc')}
                    icon={<MailCheck />}
                    title={t('contacts_empty_title')}
                  />
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <ContactDeleteDialog
        isDeleting={isDeleting}
        onDelete={onDelete}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        target={removeTarget}
      />
    </>
  );
}
