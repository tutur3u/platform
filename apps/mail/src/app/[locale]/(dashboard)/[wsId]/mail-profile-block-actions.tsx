'use client';

import { Ban, Globe } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { SenderBlockRule } from '@/lib/mail/sender-blocks/match';
import { MailBlockSenderDialog } from './mail-block-sender-dialog';
import type { ProfileBlockOptions } from './mail-profile-block-model';
import { useHoldMailProfile } from './mail-profile-context';

/** "Block sender" and "Block domain" for mailbox owners and admins. */
export function MailProfileBlockActions({
  workspaceId,
  mailboxId,
  options,
}: {
  workspaceId: string;
  mailboxId: string;
  options: ProfileBlockOptions;
}) {
  const t = useTranslations('mail.profile_actions');
  const [rule, setRule] = useState<SenderBlockRule | null>(null);
  useHoldMailProfile(Boolean(rule));
  const domain = options.domain;
  const domainButton = domain ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="rounded-full"
      disabled={Boolean(domain.disabledReason)}
      onClick={() => setRule({ kind: 'domain', value: domain.value })}
    >
      <Globe className="size-3.5" aria-hidden="true" />
      {t('block_domain', { domain: domain.value })}
    </Button>
  ) : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full text-dynamic-red hover:bg-dynamic-red/10 hover:text-dynamic-red"
        onClick={() => setRule({ kind: 'address', value: options.address })}
      >
        <Ban className="size-3.5" aria-hidden="true" />
        {t('block_sender')}
      </Button>
      {domain?.disabledReason ? (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* A disabled button gets no pointer or focus events. */}
            <span
              tabIndex={0}
              className="rounded-full outline-ring/50 focus-visible:outline-2"
            >
              {domainButton}
            </span>
          </TooltipTrigger>
          <TooltipContent>{t('public_provider')}</TooltipContent>
        </Tooltip>
      ) : (
        domainButton
      )}
      <MailBlockSenderDialog
        key={rule ? `${rule.kind}:${rule.value}` : 'closed'}
        workspaceId={workspaceId}
        mailboxId={mailboxId}
        address={options.address}
        rule={rule}
        onOpenChange={(open) => {
          if (!open) setRule(null);
        }}
      />
    </div>
  );
}
