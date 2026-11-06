'use client';

import { useQuery } from '@tanstack/react-query';
import { Hourglass, Loader2, Send, SkipForward } from '@tuturuuu/icons';
import { InternalApiError } from '@tuturuuu/internal-api';
import {
  type HeldPeriodicReportScope,
  listWorkspaceReportGroups,
  type PeriodicReportCadence,
  previewHeldPeriodicReports,
  resolveHeldPeriodicReports,
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

export type HeldAction = 'send' | 'skip';
const CADENCES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;
const ALL_CLASSES = '__all__';

/**
 * Approved reports that were never requested for delivery. Auto-send, deploys
 * and scheduled runs never send them; an administrator chooses per period or
 * class. The server re-derives the set, checks permission and records the
 * choice, so this component only collects the scope and the confirmation.
 */
export function PeriodicHeldReports({
  wsId,
  heldCount,
  canResolve,
  cadence,
  periodStart,
  periodEnd,
  onReview,
  onResolved,
}: {
  wsId: string;
  heldCount?: number;
  canResolve: boolean;
  cadence: PeriodicReportCadence | 'all';
  periodStart: string;
  periodEnd: string;
  onReview: () => void;
  onResolved: () => void;
}) {
  const t = useTranslations('reports-hub');
  const [action, setAction] = useState<HeldAction | null>(null);
  if (!heldCount) return null;
  return (
    <section
      aria-label={t('held_title')}
      className="space-y-2 rounded-xl border border-dynamic-blue/20 bg-dynamic-blue/5 p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-2 font-medium text-sm">
            <Hourglass
              className="size-4 shrink-0 text-dynamic-blue"
              aria-hidden="true"
            />
            {t('held_title')}
            <span className="rounded-full bg-dynamic-blue/10 px-2 text-dynamic-blue text-xs tabular-nums">
              {heldCount.toLocaleString()}
            </span>
          </p>
          <p className="text-muted-foreground text-xs">
            {t('held_description')}
          </p>
          {!canResolve && (
            <p className="text-muted-foreground text-xs">
              {t('held_admin_only')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onReview}>
            {t('held_review')}
          </Button>
          {canResolve && (
            <>
              <Button size="sm" onClick={() => setAction('send')}>
                <Send className="size-3.5" aria-hidden="true" />
                {t('held_send_now')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAction('skip')}
              >
                <SkipForward className="size-3.5" aria-hidden="true" />
                {t('held_skip')}
              </Button>
            </>
          )}
        </div>
      </div>
      {canResolve && action && (
        <PeriodicHeldActionDialog
          key={action}
          action={action}
          wsId={wsId}
          initialCadence={cadence === 'all' ? 'monthly' : cadence}
          initialStart={periodStart}
          initialEnd={periodEnd}
          onClose={() => setAction(null)}
          onResolved={onResolved}
        />
      )}
    </section>
  );
}

export function PeriodicHeldActionDialog({
  action,
  wsId,
  initialCadence,
  initialStart,
  initialEnd,
  onClose,
  onResolved,
}: {
  action: HeldAction;
  wsId: string;
  initialCadence: PeriodicReportCadence;
  initialStart: string;
  initialEnd: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const t = useTranslations('reports-hub');
  const common = useTranslations('common');
  const [cadence, setCadence] = useState(initialCadence);
  const [periodStart, setPeriodStart] = useState(initialStart);
  const [periodEnd, setPeriodEnd] = useState(initialEnd);
  const [groupId, setGroupId] = useState(ALL_CLASSES);
  const [pending, setPending] = useState(false);
  const scope: HeldPeriodicReportScope = {
    cadence,
    periodStart: periodStart || undefined,
    periodEnd: periodEnd || undefined,
    groupId: groupId === ALL_CLASSES ? undefined : groupId,
    timezone: periodStart || periodEnd ? getBrowserTimezone() : undefined,
  };
  const scopeKey = JSON.stringify(scope);
  const validScope =
    Boolean(periodStart) === Boolean(periodEnd) &&
    Boolean(periodStart || scope.groupId) &&
    (!periodStart || periodStart <= periodEnd);

  // One confirmation key per dialog, action and scope. A re-click or a retry
  // after a lost response replays the recorded result instead of acting again.
  const [confirmation, setConfirmation] = useState(() => ({
    scopeKey,
    key: crypto.randomUUID(),
  }));
  if (confirmation.scopeKey !== scopeKey)
    setConfirmation({ scopeKey, key: crypto.randomUUID() });

  const groups = useQuery({
    queryKey: ['periodic-held-groups', wsId],
    queryFn: () => listWorkspaceReportGroups(wsId),
    staleTime: 60_000,
  });
  const preview = useQuery({
    queryKey: ['periodic-held-preview', wsId, scopeKey],
    queryFn: () => previewHeldPeriodicReports(wsId, scope),
    enabled: validScope,
    staleTime: 0,
  });
  const count = validScope ? preview.data?.count : undefined;
  const limit =
    action === 'send' ? preview.data?.sendLimit : preview.data?.skipLimit;
  const tooMany = count !== undefined && limit !== undefined && count > limit;
  const canConfirm =
    validScope &&
    !preview.isFetching &&
    count !== undefined &&
    count > 0 &&
    !tooMany &&
    !pending &&
    confirmation.scopeKey === scopeKey;

  const confirm = async () => {
    if (!canConfirm || count === undefined) return;
    setPending(true);
    try {
      const result = await resolveHeldPeriodicReports(wsId, {
        ...scope,
        action,
        expectedCount: count,
        idempotencyKey: confirmation.key,
      });
      toast.success(
        t(action === 'send' ? 'held_send_done' : 'held_skip_done', {
          count: result.affected,
        })
      );
      onResolved();
      onClose();
    } catch (error) {
      if (!(error instanceof InternalApiError)) {
        // The response was lost: keep the key so a retry replays, never repeats.
        toast.error(t('held_action_failed'));
        return;
      }
      toast.error(
        error.code === 'HELD_SCOPE_CHANGED'
          ? t('held_scope_changed')
          : error.code === 'HELD_DELIVERY_DISABLED'
            ? t('held_delivery_disabled')
            : t('held_action_failed')
      );
      // The server answered, so this key is settled. Recount before a new try.
      setConfirmation({ scopeKey, key: crypto.randomUUID() });
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
          <DialogTitle>
            {t(action === 'send' ? 'held_send_title' : 'held_skip_title')}
          </DialogTitle>
          <DialogDescription>
            {t(
              action === 'send'
                ? 'held_send_description'
                : 'held_skip_description'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
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
          <p role="status" aria-live="polite" className="text-sm">
            {!validScope
              ? t('held_scope_required')
              : preview.isError
                ? t('held_preview_failed')
                : count === undefined || preview.isFetching
                  ? t('held_count_loading')
                  : count === 0
                    ? t('held_none')
                    : tooMany
                      ? t('held_too_many', { count, limit: limit ?? 0 })
                      : t('held_count', { count })}
          </p>
          <p className="text-muted-foreground text-xs">
            {t('held_recorded_note')}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            {common('cancel')}
          </Button>
          <Button
            variant={action === 'skip' ? 'destructive' : 'default'}
            disabled={!canConfirm}
            onClick={() => void confirm()}
          >
            {pending ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : null}
            {t(action === 'send' ? 'held_send_confirm' : 'held_skip_confirm', {
              count: count ?? 0,
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
