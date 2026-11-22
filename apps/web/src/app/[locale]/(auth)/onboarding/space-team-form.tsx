'use client';

import { X } from '@tuturuuu/icons/lucide-static';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { MAX_WORKSPACE_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { z } from 'zod';
import { FOCUS_RING } from './welcome-controls';

export const MAX_INVITES = 20;
const emailSchema = z.string().email();

/** Splits typed or pasted text into addresses at commas, spaces and newlines. */
export function parseEmailEntries(raw: string): string[] {
  return raw
    .split(/[\s,;]+/u)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The "With my team" fields: a workspace name and optional invite addresses
 * that become chips as they are entered.
 */
export function SpaceTeamForm({
  emails,
  name,
  onEmailsChange,
  onNameChange,
}: {
  emails: string[];
  name: string;
  onEmailsChange: (emails: string[]) => void;
  onNameChange: (name: string) => void;
}) {
  const t = useTranslations('onboarding_flow');
  const nameId = useId();
  const emailId = useId();
  const [pending, setPending] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  const commit = (raw: string) => {
    const entries = parseEmailEntries(raw);
    if (entries.length === 0) return;
    const next = [...emails];
    for (const entry of entries) {
      if (!emailSchema.safeParse(entry).success) {
        setEmailError(t('invalid_email', { email: entry }));
        setPending(entry);
        onEmailsChange(next);
        return;
      }
      if (!next.includes(entry) && next.length < MAX_INVITES) next.push(entry);
    }
    setEmailError(null);
    setPending('');
    onEmailsChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId}>{t('workspace_name')}</Label>
        <Input
          autoComplete="organization"
          className="h-11 rounded-xl"
          id={nameId}
          maxLength={MAX_WORKSPACE_NAME_LENGTH}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={t('workspace_name_placeholder')}
          value={name}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={emailId}>
          {t('invite_emails')}{' '}
          <span className="font-normal text-muted-foreground">
            {t('optional')}
          </span>
        </Label>
        {emails.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {emails.map((email) => (
              <li
                className="inline-flex h-7 items-center gap-1 rounded-full bg-secondary pr-1 pl-3 text-xs"
                key={email}
              >
                <span className="max-w-48 truncate">{email}</span>
                <button
                  aria-label={t('remove_email', { email })}
                  className={`${FOCUS_RING} inline-flex size-5 items-center justify-center rounded-full hover:bg-accent`}
                  onClick={() =>
                    onEmailsChange(emails.filter((item) => item !== email))
                  }
                  type="button"
                >
                  <X aria-hidden className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <Input
          aria-describedby={emailError ? `${emailId}-error` : undefined}
          aria-invalid={emailError ? true : undefined}
          autoComplete="off"
          className="h-11 rounded-xl"
          id={emailId}
          inputMode="email"
          onBlur={() => commit(pending)}
          onChange={(event) => {
            setPending(event.target.value);
            setEmailError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              commit(pending);
            }
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text');
            if (/[\s,;]/u.test(text.trim())) {
              event.preventDefault();
              commit(text);
            }
          }}
          placeholder={t('invite_placeholder')}
          type="text"
          value={pending}
        />
        {emailError ? (
          <p
            className="text-dynamic-red text-xs"
            id={`${emailId}-error`}
            role="alert"
          >
            {emailError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
