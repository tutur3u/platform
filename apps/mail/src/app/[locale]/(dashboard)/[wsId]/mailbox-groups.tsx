'use client';

import type { MailMailbox } from '@tuturuuu/internal-api';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export function MailboxGroups({
  mailboxes,
  activeMailboxId,
  renderMailbox,
}: {
  mailboxes: MailMailbox[];
  activeMailboxId: string | null;
  renderMailbox: (mailbox: MailMailbox) => ReactNode;
}) {
  const t = useTranslations('mail');
  const personal = mailboxes.filter((mailbox) => mailbox.type === 'personal');
  const shared = mailboxes.filter((mailbox) => mailbox.type !== 'personal');
  const prefixes = new Map<string, MailMailbox[]>();
  for (const mailbox of shared) {
    const [local = '', domain = ''] = mailbox.address.split('@');
    const prefix = local.includes('-') ? local.split('-')[0] : '';
    const key = prefix ? `${prefix}@${domain}` : domain;
    prefixes.set(key, [...(prefixes.get(key) ?? []), mailbox]);
  }
  const groups = new Map<string, MailMailbox[]>();
  for (const [key, members] of prefixes) {
    const label =
      members.length > 1 && key.includes('@')
        ? key.split('@')[0]!.toUpperCase()
        : t('shared_mailboxes');
    groups.set(label, [...(groups.get(label) ?? []), ...members]);
  }
  return (
    <>
      {personal.map(renderMailbox)}
      <Accordion
        type="multiple"
        key={mailboxes.map((mailbox) => mailbox.id).join(',')}
        defaultValue={[...groups]
          .filter(([, members]) =>
            members.some((mailbox) => mailbox.id === activeMailboxId)
          )
          .map(([name]) => name)}
      >
        {[...groups].map(([name, members]) => (
          <AccordionItem className="border-0" value={name} key={name}>
            <AccordionTrigger className="px-3 py-2 text-muted-foreground text-xs hover:no-underline">
              <span className="flex flex-1 items-center gap-2">
                <span>{name}</span>
                <span className="ml-auto tabular-nums">{members.length}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-0.5 pb-1 pl-2">
              {members.map(renderMailbox)}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </>
  );
}
