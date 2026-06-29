'use client';

import type { AuthRecoverySnapshot } from '@tuturuuu/internal-api/infrastructure';
import { useTranslations } from 'next-intl';
import { AuthRecoveryOverrideCard } from './auth-recovery-override-card';

function DiagnosticRow({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-1 break-words font-medium">{value ?? '-'}</p>
    </div>
  );
}

interface AuthRecoverySnapshotViewProps {
  canManage: boolean;
  isWorking: boolean;
  onRevoke: (input: { overrideId: string; reason?: string }) => void;
  onSendEmail: (overrideId: string) => void;
  snapshot: AuthRecoverySnapshot;
}

export function AuthRecoverySnapshotView({
  canManage,
  isWorking,
  onRevoke,
  onSendEmail,
  snapshot,
}: AuthRecoverySnapshotViewProps) {
  const t = useTranslations('auth-recovery-admin');
  const relatedIpBlocks = snapshot.diagnostics?.relatedIpBlocks ?? [];

  return (
    <>
      {snapshot.diagnostics ? (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-5">
            <DiagnosticRow
              label={t('diagnostics.active_override')}
              value={snapshot.diagnostics.activeOverride?.id}
            />
            <DiagnosticRow
              label={t('diagnostics.email_blocked')}
              value={
                snapshot.diagnostics.emailBlocked
                  ? snapshot.diagnostics.emailBlockedReason || t('common.yes')
                  : t('common.no')
              }
            />
            <DiagnosticRow
              label={t('diagnostics.auth_user')}
              value={snapshot.diagnostics.authUser?.id}
            />
            <DiagnosticRow
              label={t('diagnostics.recent_abuse_events')}
              value={snapshot.diagnostics.recentAbuseEvents.length}
            />
            <DiagnosticRow
              label={t('diagnostics.related_ip_blocks')}
              value={relatedIpBlocks.length}
            />
          </div>

          {relatedIpBlocks.length > 0 ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="font-semibold text-lg">
                {t('diagnostics.related_ip_blocks')}
              </h2>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {relatedIpBlocks.map((block) => (
                  <div
                    className="rounded-md border border-border p-3 text-sm"
                    key={block.id}
                  >
                    <p className="break-words font-medium">{block.ipAddress}</p>
                    <p className="text-muted-foreground">
                      {t('diagnostics.related_ip_block_reason', {
                        value: block.reason ?? '-',
                      })}
                    </p>
                    <p className="text-muted-foreground">
                      {t('diagnostics.related_ip_block_expires', {
                        value: block.expiresAt
                          ? new Date(block.expiresAt).toLocaleString()
                          : '-',
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3">
        <h2 className="font-semibold text-lg">{t('sections.overrides')}</h2>
        {snapshot.overrides.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-4 text-muted-foreground text-sm">
            {t('empty.overrides')}
          </p>
        ) : (
          snapshot.overrides.map((override) => (
            <AuthRecoveryOverrideCard
              canManage={canManage}
              isWorking={isWorking}
              key={override.id}
              onRevoke={onRevoke}
              onSendEmail={onSendEmail}
              override={override}
            />
          ))
        )}
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-lg">{t('sections.events')}</h2>
        {snapshot.events.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-4 text-muted-foreground text-sm">
            {t('empty.events')}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {snapshot.events.map((event) => (
              <div
                className="grid gap-1 border-border border-b p-3 text-sm last:border-b-0 md:grid-cols-[12rem_1fr_14rem]"
                key={event.id}
              >
                <span className="font-medium">
                  {t(`events.${event.eventType}`)}
                </span>
                <span className="break-words text-muted-foreground">
                  {event.email}
                </span>
                <span className="text-muted-foreground">
                  {new Date(event.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
