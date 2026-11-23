'use client';

import type { CalendarGuestInput } from '@tuturuuu/internal-api/calendar-guests';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '../../../button';
import { WorkspacePeoplePicker } from '../../../custom/workspace-people-picker';
import { Input } from '../../../input';

export type PendingGuest = {
  key: string;
  label: string;
  email: string | null;
  input: CalendarGuestInput;
};

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;

/** Add guests by workspace member, contact or any email address. */
export function GuestAdder({
  workspaceId,
  excludedEmails,
  disabled,
  onAdd,
}: {
  workspaceId: string;
  excludedEmails: string[];
  disabled?: boolean;
  onAdd: (guest: PendingGuest) => void;
}) {
  const t = useTranslations('calendar.native_guests');
  const tPicker = useTranslations('calendar.contact_guests');
  const [email, setEmail] = useState('');
  const normalized = email.trim().toLowerCase();
  const valid =
    EMAIL_PATTERN.test(normalized) && !excludedEmails.includes(normalized);

  const submitEmail = () => {
    if (!valid) return;
    onAdd({
      key: `email:${normalized}`,
      label: normalized,
      email: normalized,
      input: { source: 'email', email: normalized },
    });
    setEmail('');
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <WorkspacePeoplePicker
        workspaceId={workspaceId}
        emailRequired
        disabled={disabled}
        excludedEmails={excludedEmails}
        labels={{
          trigger: tPicker('add'),
          search: tPicker('search'),
          minimumQuery: tPicker('minimum_query'),
          loading: tPicker('loading'),
          empty: tPicker('empty'),
          error: tPicker('error'),
          retry: tPicker('retry'),
          contact: tPicker('contact'),
          member: tPicker('member'),
        }}
        onSelect={(person) => {
          const personEmail = person.email?.trim().toLowerCase() ?? null;
          onAdd({
            key: `${person.kind}:${person.id}`,
            label: person.displayName || personEmail || person.id,
            email: personEmail,
            input:
              person.kind === 'member'
                ? { source: 'member', userId: person.id }
                : { source: 'contact', contactId: person.id },
          });
        }}
      />
      {/* Not a <form>: the event dialog may already be one. */}
      <div className="flex flex-1 gap-2">
        <Input
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          disabled={disabled}
          placeholder={t('email_placeholder')}
          aria-label={t('email_label')}
          onChange={(changeEvent) => setEmail(changeEvent.target.value)}
          onKeyDown={(keyEvent) => {
            if (keyEvent.key !== 'Enter') return;
            keyEvent.preventDefault();
            submitEmail();
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !valid}
          onClick={submitEmail}
        >
          {t('add_email')}
        </Button>
      </div>
    </div>
  );
}
