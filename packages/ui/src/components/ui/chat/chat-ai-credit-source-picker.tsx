'use client';

import { Building2, Check, Coins, User, Wallet } from '@tuturuuu/icons';
import type { ChatAiCreditSource } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import type { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Progress } from '../progress';

type ChatTranslations = ReturnType<typeof useTranslations>;

export type ChatAiCreditStatus = {
  balanceScope?: 'user' | 'workspace';
  bonusCredits?: number | null;
  included?: {
    bonusCredits?: number | null;
    remaining?: number | null;
    totalAllocated?: number | null;
    totalUsed?: number | null;
  };
  payg?: {
    remaining?: number | null;
    totalGranted?: number | null;
    totalUsed?: number | null;
  };
  remaining?: number | null;
  tier?: string | null;
  totalAllocated?: number | null;
  totalUsed?: number | null;
};

export type ChatAiCreditSourceState = {
  credits?: ChatAiCreditStatus | null;
  isError?: boolean;
  isLoading?: boolean;
};

export function ChatAiCreditSourcePicker({
  onChange,
  sources,
  t,
  value,
}: {
  onChange: (value: ChatAiCreditSource) => void;
  sources: Record<ChatAiCreditSource, ChatAiCreditSourceState>;
  t: ChatTranslations;
  value: ChatAiCreditSource;
}) {
  return (
    <div className="grid gap-2">
      {(['workspace', 'personal'] as const).map((source) => (
        <CreditSourceCard
          key={source}
          onSelect={() => onChange(source)}
          selected={value === source}
          source={source}
          state={sources[source]}
          t={t}
        />
      ))}
    </div>
  );
}

function CreditSourceCard({
  onSelect,
  selected,
  source,
  state,
  t,
}: {
  onSelect: () => void;
  selected: boolean;
  source: ChatAiCreditSource;
  state: ChatAiCreditSourceState;
  t: ChatTranslations;
}) {
  const Icon = source === 'workspace' ? Building2 : User;
  const balance = getCreditBalance(state.credits);
  const scopeLabel =
    state.credits?.balanceScope === 'workspace'
      ? t('ai_credit_scope_workspace')
      : t('ai_credit_scope_user');
  const unavailable = !state.isLoading && (state.isError || !state.credits);

  return (
    <button
      aria-pressed={selected}
      className={cn(
        'w-full rounded-md border bg-muted/20 p-3 text-left transition-colors hover:bg-accent',
        selected && 'border-primary bg-primary/10'
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-md border bg-background',
            selected && 'border-primary text-primary'
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center justify-between gap-2">
            <span className="min-w-0 truncate font-medium text-sm">
              {source === 'workspace'
                ? t('ai_credit_workspace')
                : t('ai_credit_personal')}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs">
              {selected ? <Check className="size-3.5 text-primary" /> : null}
              {state.credits?.tier ?? ''}
            </span>
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
            <Wallet className="size-3.5 shrink-0" />
            <span className="truncate">
              {state.isLoading
                ? t('ai_credits_loading')
                : unavailable
                  ? t('ai_credits_unknown')
                  : `${formatNumber(balance.remaining)} ${t('ai_credits_remaining')}`}
            </span>
          </span>
        </span>
      </div>

      {!state.isLoading && state.credits ? (
        <div className="mt-3 space-y-2">
          <Progress
            aria-label={t('ai_credits_remaining')}
            className="h-1.5 bg-foreground/10"
            value={balance.percentRemaining}
          />
          <div className="grid grid-cols-2 gap-2 text-xs">
            <CreditMiniStat
              icon={<Coins className="size-3.5" />}
              label={t('ai_credit_plan')}
              value={`${formatNumber(balance.includedRemaining)} / ${formatNumber(balance.includedTotal)}`}
            />
            <CreditMiniStat
              icon={<Wallet className="size-3.5" />}
              label={t('ai_credit_payg')}
              value={`${formatNumber(balance.paygRemaining)} / ${formatNumber(balance.paygTotal)}`}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
            <span className="truncate">{scopeLabel}</span>
            <span className="shrink-0 font-mono">
              {formatNumber(balance.used)} {t('ai_credit_used_balance')}
            </span>
          </div>
        </div>
      ) : null}
    </button>
  );
}

function CreditMiniStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <span className="min-w-0 rounded-md border bg-background/60 px-2 py-1.5">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span className="mt-0.5 block truncate font-mono text-foreground">
        {value}
      </span>
    </span>
  );
}

function getCreditBalance(credits: ChatAiCreditStatus | null | undefined) {
  const includedTotal =
    (credits?.included?.totalAllocated ?? credits?.totalAllocated ?? 0) +
    (credits?.included?.bonusCredits ?? credits?.bonusCredits ?? 0);
  const includedRemaining =
    credits?.included?.remaining ?? credits?.remaining ?? 0;
  const paygTotal = credits?.payg?.totalGranted ?? 0;
  const paygRemaining = credits?.payg?.remaining ?? 0;
  const total = Math.max(0, includedTotal + paygTotal);
  const remaining = credits?.remaining ?? includedRemaining + paygRemaining;
  const used = credits?.totalUsed ?? Math.max(0, total - remaining);
  const percentRemaining =
    total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;

  return {
    includedRemaining: Math.max(0, includedRemaining),
    includedTotal: Math.max(0, includedTotal),
    paygRemaining: Math.max(0, paygRemaining),
    paygTotal: Math.max(0, paygTotal),
    percentRemaining,
    remaining,
    used,
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(Math.round(value));
}
