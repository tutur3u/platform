'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { InternalApiError } from '@tuturuuu/internal-api';
import {
  listWorkspaceReportGroups,
  PERIODIC_RESEND_STUCK_AFTER_MINUTES,
  type PeriodicReportCadence,
  previewResendPeriodicReports,
  type ResendPeriodicReportTarget,
  resendPeriodicReports,
} from '@tuturuuu/internal-api/reports';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { getBrowserTimezone } from '@tuturuuu/utils/timezone';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const CADENCES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;
const ALL_CLASSES = '__all__';

export type PeriodicResendIntent =
  | { kind: 'selection'; reportIds: string[] }
  | {
      kind: 'scope';
      cadence: PeriodicReportCadence;
      periodStart: string;
      periodEnd: string;
    };

/**
 * Confirms an admin resend of failed, stuck or approved-unsent reports. The
 * server derives the set, enforces permission and the rate limit, and records
 * the action; this dialog shows its exact count and sends that count back.
 */
export function PeriodicResendDialog({
  intent,
  wsId,
  onClose,
  onResolved,
}: {
  intent: PeriodicResendIntent;
  wsId: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const t = useTranslations('reports-hub');
  const common = useTranslations('common');
  const scoped = intent.kind === 'scope';
  const [cadence, setCadence] = useState<PeriodicReportCadence>(
    scoped ? intent.cadence : 'monthly'
  );
  const [periodStart, setPeriodStart] = useState(
    scoped ? intent.periodStart : ''
  );
  const [periodEnd, setPeriodEnd] = useState(scoped ? intent.periodEnd : '');
  const [groupId, setGroupId] = useState(ALL_CLASSES);
  const [pending, setPending] = useState(false);
  const target: ResendPeriodicReportTarget = scoped
    ? {
        target: 'scope',
        cadence,
        periodStart: periodStart || undefined,
        periodEnd: periodEnd || undefined,
        groupId: groupId === ALL_CLASSES ? undefined : groupId,
        timezone: periodStart || periodEnd ? getBrowserTimezone() : undefined,
      }
    : { target: 'selection', reportIds: intent.reportIds };
  const targetKey = JSON.stringify(target);
  const validTarget =
    target.target === 'selection'
      ? target.reportIds.length > 0
      : Boolean(periodStart) === Boolean(periodEnd) &&
        Boolean(periodStart || target.groupId) &&
        (!periodStart || periodStart <= periodEnd);

  // One confirmation key per dialog and target: a re-click or a retry after a
  // lost response replays the recorded result instead of resending.
  const [confirmation, setConfirmation] = useState(() => ({
    targetKey,
    key: crypto.randomUUID(),
  }));
  if (confirmation.targetKey !== targetKey)
    setConfirmation({ targetKey, key: crypto.randomUUID() });

  const groups = useQuery({
    queryKey: ['periodic-resend-groups', wsId],
    queryFn: () => listWorkspaceReportGroups(wsId),
    enabled: scoped,
    staleTime: 60_000,
  });
  const preview = useQuery({
    queryKey: ['periodic-resend-preview', wsId, targetKey],
    queryFn: () => previewResendPeriodicReports(wsId, target),
    enabled: validTarget,
    staleTime: 0,
  });
  const count = validTarget ? preview.data?.count : undefined;
  const limits = preview.data?.limits;
  const tooMany =
    count !== undefined &&
    limits !== undefined &&
    count > limits.maxReportsPerAction;
  const canConfirm =
    validTarget &&
    !preview.isFetching &&
    count !== undefined &&
    count > 0 &&
    !tooMany &&
    !pending &&
    confirmation.targetKey === targetKey;

  const confirm = async () => {
    if (!canConfirm || count === undefined) return;
    setPending(true);
    try {
      const result = await resendPeriodicReports(wsId, {
        ...target,
        expectedCount: count,
        idempotencyKey: confirmation.key,
      });
      toast.success(t('resend_done', { count: result.affected }));
      onResolved();
      onClose();
    } catch (error) {
      if (!(error instanceof InternalApiError)) {
        // The response was lost: keep the key so a retry replays.
        toast.error(t('resend_action_failed'));
        return;
      }
      toast.error(
        error.code === 'RESEND_SCOPE_CHANGED'
          ? t('resend_scope_changed')
          : error.code === 'RESEND_DELIVERY_DISABLED'
            ? t('resend_delivery_disabled')
            : error.code === 'RESEND_RATE_LIMITED'
              ? t('resend_rate_limited', {
                  seconds: error.retryAfter ?? 60,
                })
              : t('resend_action_failed')
      );
      // The server answered, so this key is settled. Recount before a new try.
      setConfirmation({ targetKey, key: crypto.randomUUID() });
      onResolved();
      void preview.refetch();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('resend_title')}</DialogTitle>
          <DialogDescription>
            {t('resend_description', {
              minutes: PERIODIC_RESEND_STUCK_AFTER_MINUTES,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {scoped && (
            <>
              <label className="grid gap-1 text-xs">
                <span>{t('cadence')}</span>
                <Select
                  value={cadence}
                  onValueChange={(value) =>
                    setCadence(value as PeriodicReportCadence)
                  }
                >
                  <SelectTrigger aria-label={t('cadence')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CADENCES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <div className="flex flex-wrap gap-2">
                <label className="grid min-w-0 flex-1 gap-1 text-xs">
                  <span>{t('period_from')}</span>
                  <Input
                    type="date"
                    aria-label={t('period_from')}
                    value={periodStart}
                    max={periodEnd || undefined}
                    onChange={(event) => setPeriodStart(event.target.value)}
                  />
                </label>
                <label className="grid min-w-0 flex-1 gap-1 text-xs">
                  <span>{t('period_to')}</span>
                  <Input
                    type="date"
                    aria-label={t('period_to')}
                    value={periodEnd}
                    min={periodStart || undefined}
                    onChange={(event) => setPeriodEnd(event.target.value)}
                  />
                </label>
              </div>
              <label className="grid gap-1 text-xs">
                <span>{t('held_class')}</span>
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger aria-label={t('held_class')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_CLASSES}>
                      {t('held_all_classes')}
                    </SelectItem>
                    {(groups.data?.groups ?? []).map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name ?? t('unknown_group')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </>
          )}
          <p role="status" aria-live="polite" className="text-sm">
            {!validTarget
              ? t('held_scope_required')
              : preview.isError
                ? t('resend_preview_failed')
                : count === undefined || preview.isFetching
                  ? t('resend_count_loading')
                  : count === 0
                    ? t('resend_none')
                    : tooMany
                      ? t('held_too_many', {
                          count,
                          limit: limits?.maxReportsPerAction ?? 0,
                        })
                      : t('resend_count', { count })}
          </p>
          {count !== undefined && count > 0 && preview.data && (
            <p className="text-muted-foreground text-xs">
              {t('resend_reasons', preview.data.reasons)}
            </p>
          )}
          {limits && (
            <p className="text-muted-foreground text-xs">
              {t('resend_recorded_note', {
                perAction: limits.maxReportsPerAction,
                actions: limits.actionsPerWindow,
                minutes: limits.actionWindowMinutes,
                perHour: limits.reportsPerHour,
              })}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            {common('cancel')}
          </Button>
          <Button disabled={!canConfirm} onClick={() => void confirm()}>
            {pending ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : null}
            {t('resend_confirm', { count: count ?? 0 })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
