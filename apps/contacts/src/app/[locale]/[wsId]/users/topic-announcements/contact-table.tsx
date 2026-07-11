'use client';

import { MailCheck, Plus, ShieldCheck, Trash2 } from '@tuturuuu/icons';
import type {
  TopicAnnouncementContact,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
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
import { useState } from 'react';
import { LinkedWorkspaceUserChip } from './linked-workspace-user-chip';
import { TopicAnnouncementsEmptyState } from './topic-announcements-empty-state';
import { TopicAnnouncementsHelpTip } from './topic-announcements-help-tip';

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
  isDeleting: boolean;
  isLoading: boolean;
  isVerifying: boolean;
  onAddContact: () => void;
  onDelete: (contactId: string) => void;
  onVerify: (contactId: string) => void;
  workspaceUsersById: Map<string, WorkspaceBasicUserRecord>;
}

export function ContactTable({
  contacts,
  isDeleting,
  isLoading,
  isVerifying,
  onAddContact,
  onDelete,
  onVerify,
  workspaceUsersById,
}: Props) {
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
            {contacts.map((contact) => {
              const canVerify = canRequestVerification(
                contact.verificationStatus
              );

              return (
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
                          user={
                            workspaceUsersById.get(contact.workspaceUserId)!
                          }
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
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={verificationVariant(
                            contact.verificationStatus
                          )}
                        >
                          {t(
                            VERIFICATION_LABEL_KEYS[contact.verificationStatus]
                          )}
                        </Badge>
                        {canVerify ? null : (
                          <TopicAnnouncementsHelpTip
                            label={t(
                              VERIFICATION_HELPER_KEYS[
                                contact.verificationStatus
                              ]
                            )}
                          />
                        )}
                      </div>
                      {canVerify ? (
                        <p className="max-w-72 text-muted-foreground text-xs">
                          {t(
                            VERIFICATION_HELPER_KEYS[contact.verificationStatus]
                          )}
                        </p>
                      ) : null}
                    </div>
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
                        onClick={() => setRemoveTarget(contact)}
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
            })}
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

      <AlertDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent
          onEscapeKeyDown={(event) => isDeleting && event.preventDefault()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t('remove_contact_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('remove_contact_description', {
                name: removeTarget?.name ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t('cancel')}
            </AlertDialogCancel>
            <Button
              disabled={isDeleting || !removeTarget}
              onClick={() => {
                if (!removeTarget) return;
                onDelete(removeTarget.id);
                setRemoveTarget(null);
              }}
              variant="destructive"
            >
              {t('remove_contact')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
