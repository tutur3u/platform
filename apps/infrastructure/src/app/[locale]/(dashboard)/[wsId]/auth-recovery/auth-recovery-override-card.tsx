'use client';

import { Loader2, Mail, ShieldOff } from '@tuturuuu/icons';
import type { AuthRecoveryOverrideSummary } from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function getOverrideStatus(override: AuthRecoveryOverrideSummary) {
  if (override.revokedAt) return 'revoked';
  if (new Date(override.expiresAt).getTime() <= Date.now()) return 'expired';
  return 'active';
}

function statusClass(status: string) {
  switch (status) {
    case 'active':
      return 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green';
    case 'expired':
      return 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

export function AuthRecoveryOverrideCard({
  canManage,
  isWorking,
  onRevoke,
  onSendEmail,
  override,
}: {
  canManage: boolean;
  isWorking: boolean;
  onRevoke: (input: { overrideId: string; reason?: string }) => void;
  onSendEmail: (overrideId: string) => void;
  override: AuthRecoveryOverrideSummary;
}) {
  const t = useTranslations('auth-recovery-admin');
  const [revokeReason, setRevokeReason] = useState('');
  const status = getOverrideStatus(override);
  const isActive = status === 'active';
  const modes = useMemo(() => {
    const values: string[] = [];
    if (override.allowNormalLogin) values.push(t('modes.normal_login'));
    if (override.allowRecoveryEmail) values.push(t('modes.recovery_email'));
    return values.join(', ');
  }, [override.allowNormalLogin, override.allowRecoveryEmail, t]);

  return (
    <article className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={statusClass(status)}>
              {t(`statuses.${status}`)}
            </Badge>
            <Badge variant="secondary">{modes}</Badge>
          </div>
          <p className="break-words font-medium">{override.email}</p>
          {override.reason ? (
            <p className="break-words text-muted-foreground text-sm">
              {override.reason}
            </p>
          ) : null}
        </div>
        <div className="text-muted-foreground text-sm sm:text-right">
          <p>
            {t('fields.expires_at', {
              value: formatDateTime(override.expiresAt),
            })}
          </p>
          <p>
            {t('fields.last_used_at', {
              value: formatDateTime(override.lastUsedAt),
            })}
          </p>
        </div>
      </div>

      {canManage && isActive ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
          <div className="space-y-2">
            <Label htmlFor={`revoke-${override.id}`}>
              {t('fields.revoke_reason')}
            </Label>
            <Input
              id={`revoke-${override.id}`}
              onChange={(event) => setRevokeReason(event.target.value)}
              placeholder={t('fields.revoke_reason_placeholder')}
              value={revokeReason}
            />
          </div>
          <Button
            disabled={isWorking || !override.allowRecoveryEmail}
            onClick={() => onSendEmail(override.id)}
            type="button"
          >
            {isWorking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            {t('actions.send_email')}
          </Button>
          <Button
            disabled={isWorking}
            onClick={() =>
              onRevoke({
                overrideId: override.id,
                reason: revokeReason.trim() || undefined,
              })
            }
            type="button"
            variant="destructive"
          >
            {isWorking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldOff className="h-4 w-4" />
            )}
            {t('actions.revoke')}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
