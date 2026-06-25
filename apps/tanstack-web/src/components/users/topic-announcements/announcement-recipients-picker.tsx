'use client';

import { MailWarning, UserPlus } from '@tuturuuu/icons';
import type {
  TopicAnnouncementContact,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  getWorkspaceUserDisplayName,
  getWorkspaceUserInitials,
} from './contacts/workspace-user-display';
import { TopicAnnouncementsEmptyState } from './topic-announcements-empty-state';
import { TopicAnnouncementsHelpTip } from './topic-announcements-help-tip';

function canReceiveAnnouncement(contact: TopicAnnouncementContact) {
  return ['verified', 'linked_confirmed_account'].includes(
    contact.verificationStatus
  );
}

interface Props {
  contacts: TopicAnnouncementContact[];
  locale: string;
  onChange: (contactIds: string[]) => void;
  selectedIds: string[];
  wsId: string;
  workspaceUsers: WorkspaceBasicUserRecord[];
}

function RecipientRow({
  contact,
  disabled,
  isSelected,
  linkedUser,
  onToggle,
  t,
}: {
  contact: TopicAnnouncementContact;
  disabled?: boolean;
  isSelected: boolean;
  linkedUser?: WorkspaceBasicUserRecord;
  onToggle: (checked: boolean) => void;
  t: ReturnType<typeof useTranslations<'ws-topic-announcements'>>;
}) {
  const isReady = canReceiveAnnouncement(contact);
  const linkedLabel = linkedUser
    ? getWorkspaceUserDisplayName(linkedUser)
    : null;

  return (
    <label className="flex items-start gap-3 rounded-md border border-transparent px-2 py-2 hover:bg-foreground/5">
      <Checkbox
        checked={isSelected}
        className="mt-0.5"
        disabled={disabled || !isReady}
        onCheckedChange={(checked) => onToggle(checked === true)}
      />
      {linkedUser ? (
        <Avatar className="mt-0.5 h-8 w-8 shrink-0">
          {linkedUser.avatar_url ? (
            <AvatarImage
              alt={linkedLabel ?? contact.name}
              src={linkedUser.avatar_url}
            />
          ) : null}
          <AvatarFallback className="bg-dynamic-green/10 text-[10px] text-dynamic-green">
            {getWorkspaceUserInitials(linkedUser)}
          </AvatarFallback>
        </Avatar>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-sm">{contact.name}</span>
          {!isReady ? (
            <Badge variant="warning">{t('verification_pending')}</Badge>
          ) : null}
        </span>
        <span className="block truncate text-muted-foreground text-xs">
          {contact.email}
        </span>
      </span>
    </label>
  );
}

function RecipientSection({
  contacts,
  disabled,
  helpLabel,
  selectedIds,
  t,
  title,
  toggleContact,
  workspaceUsersById,
}: {
  contacts: TopicAnnouncementContact[];
  disabled?: boolean;
  helpLabel?: string;
  selectedIds: string[];
  t: ReturnType<typeof useTranslations<'ws-topic-announcements'>>;
  title: string;
  toggleContact: (contactId: string, checked: boolean) => void;
  workspaceUsersById: Map<string, WorkspaceBasicUserRecord>;
}) {
  if (contacts.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 px-2">
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {title}
        </p>
        {helpLabel ? <TopicAnnouncementsHelpTip label={helpLabel} /> : null}
      </div>
      {contacts.map((contact) => (
        <RecipientRow
          contact={contact}
          disabled={disabled}
          isSelected={selectedIds.includes(contact.id)}
          key={contact.id}
          linkedUser={
            contact.workspaceUserId
              ? workspaceUsersById.get(contact.workspaceUserId)
              : undefined
          }
          onToggle={(checked) => toggleContact(contact.id, checked)}
          t={t}
        />
      ))}
    </div>
  );
}

export function AnnouncementRecipientsPicker({
  contacts,
  locale,
  onChange,
  selectedIds,
  wsId,
  workspaceUsers,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const contactsHref = `/${locale}/${wsId}/users/topic-announcements/contacts`;
  const workspaceUsersById = useMemo(
    () => new Map(workspaceUsers.map((user) => [user.id, user])),
    [workspaceUsers]
  );
  const readyContacts = contacts.filter(canReceiveAnnouncement);
  const pendingContacts = contacts.filter(
    (contact) => !canReceiveAnnouncement(contact)
  );

  const toggleContact = (contactId: string, checked: boolean) => {
    onChange(
      checked
        ? [...selectedIds, contactId]
        : selectedIds.filter((id) => id !== contactId)
    );
  };

  return (
    <div className="space-y-3 rounded-md border bg-background p-3">
      <RecipientsPickerHeader
        onClear={() => onChange([])}
        onSelectAllReady={() =>
          onChange(readyContacts.map((contact) => contact.id))
        }
        readyCount={readyContacts.length}
        selectedCount={selectedIds.length}
        t={t}
      />

      {contacts.length === 0 ? (
        <TopicAnnouncementsEmptyState
          action={
            <Button asChild size="sm">
              <Link href={contactsHref}>
                {t('recipients_add_contacts_cta')}
              </Link>
            </Button>
          }
          description={t('recipients_empty_desc')}
          icon={<UserPlus />}
          title={t('recipients_empty_title')}
        />
      ) : readyContacts.length === 0 && pendingContacts.length > 0 ? (
        <TopicAnnouncementsEmptyState
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={contactsHref}>{t('recipients_verify_cta')}</Link>
            </Button>
          }
          description={t('recipients_pending_desc')}
          icon={<MailWarning />}
          title={t('recipients_pending_title')}
        />
      ) : (
        <ScrollArea className="h-44 pr-3">
          <div className="space-y-4">
            <RecipientSection
              contacts={readyContacts}
              selectedIds={selectedIds}
              t={t}
              title={t('ready_recipients')}
              toggleContact={toggleContact}
              workspaceUsersById={workspaceUsersById}
            />
            <RecipientSection
              contacts={pendingContacts}
              disabled
              helpLabel={t('recipient_pending_tooltip')}
              selectedIds={selectedIds}
              t={t}
              title={t('pending_recipients')}
              toggleContact={toggleContact}
              workspaceUsersById={workspaceUsersById}
            />
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function RecipientsPickerHeader({
  onClear,
  onSelectAllReady,
  readyCount,
  selectedCount,
  t,
}: {
  onClear: () => void;
  onSelectAllReady: () => void;
  readyCount: number;
  selectedCount: number;
  t: ReturnType<typeof useTranslations<'ws-topic-announcements'>>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="font-medium text-sm">{t('recipients')}</p>
        <p className="text-muted-foreground text-xs">
          {t('recipients_helper', {
            ready: readyCount.toString(),
            selected: selectedCount.toString(),
          })}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={readyCount === 0}
          onClick={onSelectAllReady}
          size="sm"
          type="button"
          variant="outline"
        >
          {t('select_all_ready')}
        </Button>
        <Button
          disabled={selectedCount === 0}
          onClick={onClear}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t('clear_recipients')}
        </Button>
      </div>
    </div>
  );
}
