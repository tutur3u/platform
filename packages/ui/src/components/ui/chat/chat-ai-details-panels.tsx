'use client';

import {
  Brain,
  Coins,
  Database,
  FileText,
  Gauge,
  ImageIcon,
  Link2,
  LoaderCircle,
  MessageSquare,
  WalletCards,
  Zap,
} from '@tuturuuu/icons';
import type {
  ChatAiCreditSource,
  ChatAiObservability,
  ChatAiSettings,
  ChatAiThinkingMode,
  ChatAttachment,
  ChatSharedLink,
} from '@tuturuuu/internal-api';
import type { useTranslations } from 'next-intl';
import { type ReactNode, useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../select';
import {
  ChatAiCreditSourcePicker,
  type ChatAiCreditSourceState,
} from './chat-ai-credit-source-picker';
import { formatChatTime, formatFileSize } from './utils';

type ChatTranslations = ReturnType<typeof useTranslations>;

export function SettingsPanel({
  creditSources,
  isLoading,
  models,
  onCreditSourceChange,
  onModelChange,
  onThinkingModeChange,
  settings,
  t,
}: {
  creditSources: Record<ChatAiCreditSource, ChatAiCreditSourceState>;
  isLoading: boolean;
  models: { label: string; value: string }[];
  onCreditSourceChange: (value: ChatAiCreditSource) => void;
  onModelChange: (value: string) => void;
  onThinkingModeChange: (value: ChatAiThinkingMode) => void;
  settings?: ChatAiSettings;
  t: ChatTranslations;
}) {
  if (isLoading || !settings) {
    return <LoadingState label={t('loading_ai_settings')} />;
  }

  return (
    <div className="space-y-4">
      <Field icon={<Brain className="size-4" />} label={t('ai_model')}>
        <Select value={settings.modelId ?? ''} onValueChange={onModelChange}>
          <SelectTrigger>
            <SelectValue placeholder={t('ai_model_placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model.value} value={model.value}>
                {model.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        icon={<WalletCards className="size-4" />}
        label={t('ai_credit_source')}
      >
        <ChatAiCreditSourcePicker
          onChange={onCreditSourceChange}
          sources={creditSources}
          t={t}
          value={settings.creditSource}
        />
      </Field>

      <Field icon={<Gauge className="size-4" />} label={t('ai_response_mode')}>
        <Select
          value={settings.thinkingMode}
          onValueChange={(value) =>
            onThinkingModeChange(value as ChatAiThinkingMode)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fast">{t('ai_fast_mode')}</SelectItem>
            <SelectItem value="thinking">{t('ai_thinking_mode')}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

export function UsagePanel({
  isLoading,
  observability,
  t,
}: {
  isLoading: boolean;
  observability: ChatAiObservability | undefined;
  t: ChatTranslations;
}) {
  if (isLoading) return <LoadingState label={t('loading_ai_usage')} />;
  if (!observability) return <EmptyState label={t('ai_no_usage')} />;

  const totals = observability.totals;
  const contextMax = Math.max(
    1,
    ...observability.contextBreakdown.map((item) => item.tokensEstimate)
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Metric
          icon={<Zap className="size-3.5" />}
          label={t('ai_total_tokens')}
          value={formatNumber(totals.totalTokens)}
        />
        <Metric
          icon={<Coins className="size-3.5" />}
          label={t('ai_total_cost')}
          value={`$${totals.costUsd.toFixed(6)}`}
        />
        <Metric
          icon={<MessageSquare className="size-3.5" />}
          label={t('ai_messages')}
          value={String(totals.messageCount)}
        />
        <Metric
          icon={<Database className="size-3.5" />}
          label={t('ai_cached_tokens')}
          value={formatNumber(
            totals.cachedInputTokens + totals.cachedOutputTokens
          )}
        />
      </div>

      <section>
        <h3 className="mb-2 font-medium text-sm">
          {t('ai_context_breakdown')}
        </h3>
        {observability.contextBreakdown.length === 0 ? (
          <EmptyState label={t('ai_context_empty')} />
        ) : (
          <div className="space-y-1.5">
            {observability.contextBreakdown.map((item) => (
              <div
                className="min-w-0 overflow-hidden rounded-md border bg-muted/20 p-2 text-xs"
                key={item.id}
              >
                <div className="grid min-w-0 grid-cols-[1fr_auto] items-start gap-2">
                  <span
                    className="min-w-0 break-words font-medium leading-5"
                    title={item.label}
                  >
                    {item.label}
                  </span>
                  <span className="rounded-sm border bg-background px-1.5 py-0.5 font-mono text-muted-foreground tabular-nums">
                    {formatNumber(item.tokensEstimate)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.max(
                        4,
                        Math.min(100, (item.tokensEstimate / contextMax) * 100)
                      )}%`,
                    }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-muted-foreground">
                  <span className="truncate">{item.kind}</span>
                  <span className="shrink-0">
                    {formatNumber(item.chars)} {t('ai_chars_short')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-medium text-sm">{t('ai_message_usage')}</h3>
        <div className="space-y-2">
          {observability.messages
            .filter(
              (message) =>
                message.usage.totalTokens > 0 || message.usage.costUsd > 0
            )
            .map((message) => (
              <div
                className="min-w-0 overflow-hidden rounded-md border bg-muted/20 p-2 text-xs"
                key={message.id}
              >
                <div className="grid min-w-0 grid-cols-[1fr_auto] items-start gap-2">
                  <span
                    className="min-w-0 break-words font-medium leading-5"
                    title={message.contentPreview || message.role}
                  >
                    {message.contentPreview || message.role}
                  </span>
                  <span className="rounded-sm border bg-background px-1.5 py-0.5 text-muted-foreground">
                    {message.exact ? t('ai_exact') : t('ai_estimated')}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-muted-foreground">
                  <TokenChip
                    label={t('ai_input_tokens')}
                    value={formatNumber(message.usage.inputTokens)}
                  />
                  <TokenChip
                    label={t('ai_output_tokens')}
                    value={formatNumber(message.usage.outputTokens)}
                  />
                  <TokenChip
                    label={t('ai_reasoning_tokens')}
                    value={formatNumber(message.usage.reasoningTokens)}
                  />
                  <TokenChip
                    label={t('ai_total_cost')}
                    value={`$${message.usage.costUsd.toFixed(6)}`}
                  />
                </div>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}

export function SharedPanel({
  files,
  links,
  onOpenAttachment,
  photos,
  t,
}: {
  files: ChatAttachment[];
  links: ChatSharedLink[];
  onOpenAttachment?: (attachment: ChatAttachment) => void;
  photos: ChatAttachment[];
  t: ChatTranslations;
}) {
  const sections = useMemo(
    () => [
      {
        empty: t('no_links_shared'),
        icon: <Link2 className="size-4" />,
        items: links,
        title: t('links'),
        type: 'links' as const,
      },
      {
        empty: t('no_photos_shared'),
        icon: <ImageIcon className="size-4" />,
        items: photos,
        title: t('photos'),
        type: 'attachments' as const,
      },
      {
        empty: t('no_files_shared'),
        icon: <FileText className="size-4" />,
        items: files,
        title: t('files'),
        type: 'attachments' as const,
      },
    ],
    [files, links, photos, t]
  );

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <section key={section.title}>
          <h3 className="mb-2 font-medium text-sm">{section.title}</h3>
          {section.items.length === 0 ? (
            <EmptyState icon={section.icon} label={section.empty} />
          ) : (
            <div className="space-y-1">
              {section.type === 'links'
                ? (section.items as ChatSharedLink[]).map((link) => (
                    <a
                      className="block rounded-md border bg-muted/20 p-2 text-xs hover:bg-accent"
                      href={link.url}
                      key={`${link.messageId}-${link.url}`}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      <span className="block truncate">{link.url}</span>
                      <span className="mt-1 block text-muted-foreground">
                        {formatChatTime(link.createdAt)}
                      </span>
                    </a>
                  ))
                : (section.items as ChatAttachment[]).map((attachment) => (
                    <button
                      className="flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md border bg-muted/20 p-2 text-left text-xs hover:bg-accent"
                      key={attachment.id}
                      onClick={() => onOpenAttachment?.(attachment)}
                      type="button"
                    >
                      {section.icon}
                      <span className="min-w-0 flex-1 overflow-hidden">
                        <span
                          className="block truncate font-medium"
                          title={attachment.filename}
                        >
                          {attachment.filename}
                        </span>
                        <span className="block text-muted-foreground">
                          {formatFileSize(attachment.sizeBytes)}
                        </span>
                      </span>
                    </button>
                  ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function Field({
  children,
  icon,
  label,
}: {
  children: ReactNode;
  icon?: ReactNode;
  label: string;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-2.5">
      <span className="mb-2 flex items-center gap-2 font-medium text-sm">
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        {label}
      </span>
      {children}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/20 p-2">
      <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 truncate font-semibold text-sm tabular-nums">
        {value}
      </div>
    </div>
  );
}

function TokenChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0 rounded-sm border bg-background px-1.5 py-1">
      <span className="block truncate">{label}</span>
      <span className="block truncate font-mono text-foreground tabular-nums">
        {value}
      </span>
    </span>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center p-6 text-muted-foreground text-sm">
      <LoaderCircle className="mr-2 size-4 animate-spin" />
      {label}
    </div>
  );
}

function EmptyState({ icon, label }: { icon?: ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(Math.round(value));
}
