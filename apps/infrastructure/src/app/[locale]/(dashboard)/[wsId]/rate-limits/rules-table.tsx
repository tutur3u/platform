'use client';

import { Ban, Infinity as InfinityIcon, Trash2 } from '@tuturuuu/icons';
import type {
  RateLimitRule,
  RateLimitWriteBaseLimits,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import {
  describeEffectiveWriteLimits,
  describeReadEffect,
  formatDateTime,
  getModeTone,
} from './rate-limits-format';

const EDGE_CACHED_SUBJECT_TYPES = new Set([
  'session',
  'cidr',
  'ip',
  'workspace',
]);

export function RateLimitRulesTable({
  base,
  canManage,
  edgeCachedSubjectKeys,
  isRevoking,
  onRevoke,
  rules,
}: {
  base: RateLimitWriteBaseLimits;
  canManage: boolean;
  edgeCachedSubjectKeys: string[];
  isRevoking: boolean;
  onRevoke: (ruleId: string) => void;
  rules: RateLimitRule[];
}) {
  const t = useTranslations('rate-limits');
  const liveKeys = new Set(edgeCachedSubjectKeys);

  if (rules.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card p-6 text-muted-foreground text-sm">
        {t('empty.rules')}
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th className="p-3 font-medium">{t('tables.subject')}</th>
            <th className="p-3 font-medium">{t('tables.mode')}</th>
            <th className="p-3 font-medium">{t('tables.effective')}</th>
            <th className="p-3 font-medium">{t('tables.expires')}</th>
            {canManage ? <th className="p-3" /> : null}
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr className="border-border border-t align-top" key={rule.id}>
              <td className="p-3">
                <Badge variant="secondary">
                  {t(`subject_types.${rule.subject_type}`)}
                </Badge>
                <div className="mt-2 max-w-80 truncate font-medium">
                  {rule.subject?.label ?? rule.subject_key}
                </div>
                {rule.subject?.detail ? (
                  <div className="mt-1 max-w-80 truncate text-muted-foreground text-xs">
                    {rule.subject.detail}
                  </div>
                ) : null}
                {rule.reason ? (
                  <div className="mt-1 max-w-72 truncate text-muted-foreground text-xs">
                    {rule.reason}
                  </div>
                ) : null}
                <details className="mt-2 text-muted-foreground text-xs">
                  <summary className="cursor-pointer">
                    {t('tables.technical_subject')}
                  </summary>
                  <div className="mt-1 break-all font-mono">
                    {rule.subject_key}
                  </div>
                </details>
              </td>
              <td className="p-3">
                <Badge className={getModeTone(rule.limit_mode)}>
                  {rule.limit_mode === 'unlimited' ? (
                    <InfinityIcon className="mr-1 h-3 w-3" />
                  ) : null}
                  {rule.limit_mode === 'blocked' ? (
                    <Ban className="mr-1 h-3 w-3" />
                  ) : null}
                  {t(`modes.${rule.limit_mode}`)}
                </Badge>
                {EDGE_CACHED_SUBJECT_TYPES.has(rule.subject_type) ? (
                  <div className="mt-1">
                    <Badge
                      className={
                        liveKeys.has(rule.subject_key)
                          ? 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green'
                          : 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow'
                      }
                    >
                      {liveKeys.has(rule.subject_key)
                        ? t('edge.synced')
                        : t('edge.pending')}
                    </Badge>
                  </div>
                ) : null}
              </td>
              <td className="p-3">
                <div>{describeEffectiveWriteLimits(rule, base)}</div>
                <div className="text-muted-foreground text-xs">
                  {describeReadEffect(rule)}
                </div>
              </td>
              <td className="p-3 text-muted-foreground text-xs">
                {formatDateTime(rule.expires_at)}
              </td>
              {canManage ? (
                <td className="p-3 text-right">
                  <Button
                    disabled={isRevoking}
                    onClick={() => onRevoke(rule.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('rules.revoke')}
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
