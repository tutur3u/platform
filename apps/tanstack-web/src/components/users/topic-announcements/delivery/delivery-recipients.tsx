'use client';

import type { TopicAnnouncementRecord } from '@tuturuuu/internal-api';
import { badgeVariants } from '@tuturuuu/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';

const VISIBLE_RECIPIENTS = 3;

interface DeliveryRecipientsProps {
  announcement: TopicAnnouncementRecord;
}

export function DeliveryRecipients({ announcement }: DeliveryRecipientsProps) {
  const t = useTranslations('ws-topic-announcements');
  const emails = announcement.contacts
    .map((contact) => contact.email.trim())
    .filter(Boolean);

  if (emails.length === 0) {
    return <span className="text-muted-foreground text-sm">&mdash;</span>;
  }

  const visible = emails.slice(0, VISIBLE_RECIPIENTS);
  const hidden = emails.slice(VISIBLE_RECIPIENTS);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((email) => (
        <span
          className="rounded-md border bg-foreground/5 px-2 py-0.5 text-xs"
          key={email}
        >
          {email}
        </span>
      ))}
      {hidden.length > 0 ? (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`${badgeVariants({ variant: 'secondary' })} cursor-default`}
                type="button"
              >
                {t('recipients_more', { count: hidden.length.toString() })}
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <div className="flex flex-col gap-0.5">
                {hidden.map((email) => (
                  <span key={email}>{email}</span>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </div>
  );
}
