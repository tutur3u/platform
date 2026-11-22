'use client';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import { Mail, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { WorkspacePeoplePicker } from '@tuturuuu/ui/custom/workspace-people-picker';
import {
  meetMailOrigins,
  meetMailUrl,
} from '@tuturuuu/utils/meet-mail-handoff';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { buildJoinUrl } from '../lib/room-code';

export function MeetMailShare({
  open,
  onOpenChange,
  meetingId,
  title,
  workspaceId,
  actorId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  title: string;
  workspaceId: string;
  actorId: string;
}) {
  const t = useTranslations('meet.mail_handoff');
  const locale = useLocale();
  const [to, setTo] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <WorkspacePeoplePicker
          workspaceId={workspaceId}
          emailRequired
          excludedEmails={to}
          disabled={to.length >= 20}
          labels={{
            trigger: t('add'),
            search: t('search'),
            minimumQuery: t('minimum_query'),
            loading: t('loading'),
            empty: t('empty'),
            error: t('error'),
            retry: t('retry'),
            contact: t('contact'),
            member: t('member'),
          }}
          onSelect={(person) => {
            const email = person.email?.trim().toLowerCase();
            if (
              email &&
              /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email) &&
              !to.includes(email) &&
              to.length < 20
            )
              setTo([...to, email]);
          }}
        />
        <ul>
          {to.map((email) => (
            <li key={email} className="flex items-center gap-2">
              {email}
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('remove', { email })}
                onClick={() => setTo(to.filter((value) => value !== email))}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-sm">{t('preview')}</p>
        {failed && <p role="alert">{t('error')}</p>}
        <Button
          disabled={!to.length}
          onClick={() => {
            try {
              const subject =
                title
                  .replace(/[\x00-\x1f\x7f\u2028\u2029]/gu, ' ')
                  .trim()
                  .slice(0, 160) || t('title');
              const joinUrl = buildJoinUrl(meetMailOrigins().meet, meetingId);
              const url = meetMailUrl(
                {
                  v: 1,
                  source: 'meet',
                  id: crypto.randomUUID(),
                  issuedAt: Date.now(),
                  actorId,
                  workspaceId,
                  subject,
                  joinUrl,
                  body: `${subject}\n${joinUrl}`,
                  to,
                },
                locale
              );
              window.open(url, '_blank', 'noopener,noreferrer');
              onOpenChange(false);
            } catch {
              setFailed(true);
            }
          }}
        >
          {t('open')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function MeetMailMenuItem({ onSelect }: { onSelect: () => void }) {
  const t = useTranslations('meet.mail_handoff');
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <Mail className="size-4" />
      {t('title')}
    </DropdownMenuItem>
  );
}
