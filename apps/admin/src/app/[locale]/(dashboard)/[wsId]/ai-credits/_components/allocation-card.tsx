'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Switch } from '@tuturuuu/ui/switch';
import type { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { Allocation } from './allocation-types';

function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(1);
}

function formatModelLabel(modelId?: string | null) {
  if (!modelId) return '-';

  return modelId.includes('/')
    ? modelId.split('/').slice(1).join('/')
    : modelId;
}

function tierBadgeVariant(tier: string) {
  switch (tier) {
    case 'FREE':
      return 'secondary' as const;
    case 'PLUS':
    case 'PRO':
      return 'default' as const;
    case 'ENTERPRISE':
      return 'destructive' as const;
    default:
      return 'outline' as const;
  }
}

export function AllocationCard({
  allocation,
  onEdit,
  onToggleActive,
  t,
}: {
  allocation: Allocation;
  onEdit: () => void;
  onToggleActive: (checked: boolean) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <Card className="overflow-hidden border-border/70 bg-linear-to-br from-background via-background to-muted/20 shadow-sm">
      <CardHeader className="border-border/60 border-b bg-muted/20 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <CardTitle className="text-xl tracking-tight">
              {allocation.tier}
            </CardTitle>
            <Badge variant={tierBadgeVariant(allocation.tier)}>
              {allocation.is_active ? t('active') : t('inactive')}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>
              {t('edit')}
            </Button>
            <Switch
              checked={allocation.is_active}
              onCheckedChange={onToggleActive}
            />
          </div>
        </div>
        <CardDescription>
          {allocation.credits_per_seat != null
            ? `${formatCredits(allocation.credits_per_seat)} ${t('credits_per_seat')}`
            : `${formatCredits(allocation.monthly_credits)} ${t('monthly_credits')}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Metric label={t('default_language_model')}>
            <span className="truncate font-medium font-mono text-xs">
              {formatModelLabel(allocation.default_language_model)}
            </span>
          </Metric>
          <Metric label={t('default_image_model')}>
            <span className="truncate font-medium font-mono text-xs">
              {formatModelLabel(allocation.default_image_model)}
            </span>
          </Metric>
          <Metric label={t('monthly_credits')}>
            {formatCredits(allocation.monthly_credits)}
          </Metric>
          <Metric label={t('credits_per_seat')}>
            {allocation.credits_per_seat != null
              ? formatCredits(allocation.credits_per_seat)
              : '-'}
          </Metric>
          <Metric label={t('daily_limit')}>
            {allocation.daily_limit != null
              ? formatCredits(allocation.daily_limit)
              : t('unlimited')}
          </Metric>
          <Metric label={t('max_output_tokens')}>
            {allocation.max_output_tokens_per_request?.toLocaleString() ??
              t('unlimited')}
          </Metric>
          <Metric label={t('markup')}>{allocation.markup_multiplier}x</Metric>
        </dl>

        <div className="rounded-xl border border-border/70 border-dashed bg-muted/15 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-sm">{t('allowed_models')}</p>
              <p className="text-muted-foreground text-xs">
                {allocation.allowed_models.length === 0
                  ? t('alloc_allowlist_all_description')
                  : t('alloc_allowlist_limited_description', {
                      count: allocation.allowed_models.length,
                    })}
              </p>
            </div>
            <Badge
              variant={
                allocation.allowed_models.length === 0 ? 'outline' : 'secondary'
              }
            >
              {allocation.allowed_models.length === 0
                ? t('all_models')
                : allocation.allowed_models.length}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/70 p-3">
      <dt className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
        {label}
      </dt>
      <dd className="mt-1 font-medium">{children}</dd>
    </div>
  );
}
