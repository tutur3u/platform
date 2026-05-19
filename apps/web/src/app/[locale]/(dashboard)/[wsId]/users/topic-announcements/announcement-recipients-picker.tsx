'use client';

import type { TopicAnnouncementContact } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { useTranslations } from 'next-intl';

function canReceiveAnnouncement(contact: TopicAnnouncementContact) {
  return ['verified', 'linked_confirmed_account'].includes(
    contact.verificationStatus
  );
}

interface Props {
  contacts: TopicAnnouncementContact[];
  selectedIds: string[];
  onChange: (contactIds: string[]) => void;
}

function RecipientRow({
  contact,
  disabled,
  isSelected,
  onToggle,
  t,
}: {
  contact: TopicAnnouncementContact;
  disabled?: boolean;
  isSelected: boolean;
  onToggle: (checked: boolean) => void;
  t: ReturnType<typeof useTranslations<'ws-topic-announcements'>>;
}) {
  const isReady = canReceiveAnnouncement(contact);

  return (
    <label className="flex items-start gap-3 rounded-md border border-transparent px-2 py-2 hover:bg-foreground/5">
      <Checkbox
        checked={isSelected}
        className="mt-0.5"
        disabled={disabled || !isReady}
        onCheckedChange={(checked) => onToggle(checked === true)}
      />
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
  selectedIds,
  t,
  title,
  toggleContact,
}: {
  contacts: TopicAnnouncementContact[];
  disabled?: boolean;
  selectedIds: string[];
  t: ReturnType<typeof useTranslations<'ws-topic-announcements'>>;
  title: string;
  toggleContact: (contactId: string, checked: boolean) => void;
}) {
  if (contacts.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="px-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {title}
      </p>
      {contacts.map((contact) => (
        <RecipientRow
          contact={contact}
          disabled={disabled}
          isSelected={selectedIds.includes(contact.id)}
          key={contact.id}
          onToggle={(checked) => toggleContact(contact.id, checked)}
          t={t}
        />
      ))}
    </div>
  );
}

export function AnnouncementRecipientsPicker({
  contacts,
  onChange,
  selectedIds,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
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
    <div className="space-y-3 rounded-md border p-3">
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
        <p className="text-muted-foreground text-sm">
          {t('no_ready_contacts')}
        </p>
      ) : readyContacts.length === 0 && pendingContacts.length > 0 ? (
        <p className="text-muted-foreground text-sm">
          {t('no_ready_contacts')}
        </p>
      ) : (
        <ScrollArea className="h-44 pr-3">
          <div className="space-y-4">
            <RecipientSection
              contacts={readyContacts}
              selectedIds={selectedIds}
              t={t}
              title={t('ready_recipients')}
              toggleContact={toggleContact}
            />
            <RecipientSection
              contacts={pendingContacts}
              disabled
              selectedIds={selectedIds}
              t={t}
              title={t('pending_recipients')}
              toggleContact={toggleContact}
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
