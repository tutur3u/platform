'use client';

import type { MailSenderBlock } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  SettingsSection,
  SettingsSectionBlock,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import { Input } from '@tuturuuu/ui/input';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { MailSettingsRowsSkeleton } from './mail-skeletons';
import {
  formatMailThreadDate,
  formatMailThreadDateTitle,
} from './mail-thread-date';
import {
  parseSenderBlockInput,
  senderBlockTarget,
} from './mail-sender-block-model';
import { MailUnblockDialog } from './mail-unblock-dialog';
import {
  useMailSenderBlockMutations,
  useMailSenderBlocks,
} from './use-mail-sender-blocks';

export function MailBlockedSenderSettings({
  canManage,
  mailboxId,
  workspaceId,
}: {
  canManage: boolean;
  mailboxId: string;
  workspaceId: string;
}) {
  const t = useTranslations('mail.blocked_senders');
  const locale = useLocale();
  const blocks = useMailSenderBlocks(workspaceId, mailboxId);
  const { add } = useMailSenderBlockMutations(workspaceId, mailboxId);
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [unblocking, setUnblocking] = useState<MailSenderBlock | null>(null);
  const input = parseSenderBlockInput(value);
  const inputError =
    input.status === 'shared_provider'
      ? t('shared_provider', { domain: input.domain })
      : submitted && input.status === 'invalid'
        ? t('invalid')
        : null;

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      {canManage ? (
        <SettingsSectionBlock>
          <form
            className="flex flex-wrap items-start gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(true);
              if (input.status !== 'valid') return;
              add.mutate(input.rule, {
                onSuccess: () => {
                  setValue('');
                  setSubmitted(false);
                },
              });
            }}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <Input
                aria-describedby={inputError ? 'sender-block-error' : undefined}
                aria-invalid={Boolean(inputError)}
                aria-label={t('input_label')}
                onChange={(event) => setValue(event.target.value)}
                placeholder={t('input_placeholder')}
                value={value}
              />
              {inputError ? (
                <p
                  className="text-dynamic-red text-xs"
                  id="sender-block-error"
                  role="alert"
                >
                  {inputError}
                </p>
              ) : null}
            </div>
            <Button
              disabled={add.isPending || input.status !== 'valid'}
              type="submit"
            >
              {t('block')}
            </Button>
          </form>
        </SettingsSectionBlock>
      ) : null}
      {blocks.isPending ? (
        <MailSettingsRowsSkeleton srLabel={t('loading')} />
      ) : blocks.isError ? (
        <SettingsSectionMessage
          tone="error"
          action={
            <Button onClick={() => void blocks.refetch()} variant="outline">
              {t('retry')}
            </Button>
          }
        >
          {t('load_failed')}
        </SettingsSectionMessage>
      ) : blocks.data.length === 0 ? (
        <SettingsSectionMessage>{t('empty')}</SettingsSectionMessage>
      ) : (
        blocks.data.map((block) => (
          <SettingsSectionBlock
            className="flex flex-wrap items-center gap-3 py-3"
            key={block.id}
          >
            <span className="min-w-0 flex-1 truncate font-medium text-sm">
              {senderBlockTarget(block)}
            </span>
            <Badge variant="secondary">
              {block.kind === 'domain' ? t('kind_domain') : t('kind_sender')}
            </Badge>
            <time
              className="shrink-0 text-muted-foreground text-xs tabular-nums"
              dateTime={block.createdAt}
              title={formatMailThreadDateTitle(block.createdAt, locale)}
            >
              {formatMailThreadDate(block.createdAt, locale)}
            </time>
            {canManage ? (
              <Button
                onClick={() => setUnblocking(block)}
                size="sm"
                variant="ghost"
              >
                {t('unblock')}
              </Button>
            ) : null}
          </SettingsSectionBlock>
        ))
      )}
      <MailUnblockDialog
        block={unblocking}
        mailboxId={mailboxId}
        onOpenChange={(open) => {
          if (!open) setUnblocking(null);
        }}
        workspaceId={workspaceId}
      />
    </SettingsSection>
  );
}
