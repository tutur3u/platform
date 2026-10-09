'use client';

import {
  type PeriodicReport,
  type PeriodicReportDeliveryBatchProgress,
  type PeriodicReportDeliveryBatchResult,
  requestPeriodicReportDeliveryBatch,
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
import { useWorkspaceActor } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  MAX_SELECTED_DELIVERIES,
  samePeriodicRecipient,
} from './periodic-delivery-selection';

type BatchResult = PeriodicReportDeliveryBatchResult;
type Progress = PeriodicReportDeliveryBatchProgress;
export type PeriodicBatchIntent = {
  actor: NonNullable<ReturnType<typeof useWorkspaceActor>>;
  wsId: string;
  epoch: number;
  reports: PeriodicReport[];
};

export function PeriodicDeliveryBatchDialog({
  intent,
  reports,
  wsId,
  epoch,
  canSend,
  onClose,
  onQueued,
}: {
  intent: PeriodicBatchIntent | null;
  reports: PeriodicReport[];
  wsId: string;
  epoch: number;
  canSend: boolean;
  onClose: () => void;
  onQueued: () => void;
}) {
  const t = useTranslations('reports-hub');
  const actor = useWorkspaceActor();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [pending, setPending] = useState(false);
  const previousIntent = useRef(intent);
  if (previousIntent.current !== intent) {
    previousIntent.current = intent;
    if (progress) setProgress(null);
    if (result) setResult(null);
    if (pending) setPending(false);
  }
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const submitted = useRef<PeriodicBatchIntent | null>(null);
  const latest = useRef({ intent, reports, wsId, epoch, canSend, actor });
  latest.current = { intent, reports, wsId, epoch, canSend, actor };
  const safety = useRef({ intent, invalid: false });
  const confirmed = useRef(new Set<string>());
  if (safety.current.intent !== intent) {
    safety.current = { intent, invalid: false };
    confirmed.current = new Set();
  }
  if (
    !intent ||
    intent.actor !== actor ||
    intent.wsId !== wsId ||
    intent.epoch !== epoch ||
    !canSend
  )
    safety.current.invalid = true;
  const valid = Boolean(
    !safety.current.invalid &&
      intent &&
      intent.actor === actor &&
      intent.wsId === wsId &&
      intent.epoch === epoch &&
      canSend &&
      intent.reports.length > 0 &&
      intent.reports.length <= MAX_SELECTED_DELIVERIES
  );
  const assertScope = () => {
    const now = latest.current;
    if (
      !mounted.current ||
      safety.current.invalid ||
      !intent ||
      now.intent !== intent ||
      now.actor !== intent.actor ||
      now.wsId !== intent.wsId ||
      now.epoch !== intent.epoch ||
      !now.canSend
    )
      throw new Error('Delivery selection expired');
    intent.actor.assertActive();
  };
  const assertActive = () => {
    assertScope();
    if (!intent) throw new Error('Delivery selection expired');
    const now = latest.current;
    if (
      !intent.reports.every(
        (selected) =>
          confirmed.current.has(selected.id) ||
          now.reports.some((report) => samePeriodicRecipient(selected, report))
      )
    )
      throw new Error('Delivery recipients changed');
  };
  const confirm = async () => {
    if (!intent || !valid || submitted.current === intent || pending) return;
    try {
      assertActive();
    } catch {
      onClose();
      return;
    }
    submitted.current = intent;
    setPending(true);
    setProgress(null);
    setResult(null);
    try {
      const response = await requestPeriodicReportDeliveryBatch(
        wsId,
        intent.reports.map((report) => report.id),
        {
          assertActive,
          onProgress: (next) => {
            assertScope();
            for (const item of next.items)
              if (item.queued) confirmed.current.add(item.reportId);
            setProgress(next);
          },
        }
      );
      try {
        assertScope();
      } catch {
        return;
      }
      setResult(response);
      onQueued();
    } catch {
      try {
        assertScope();
      } catch {
        return;
      }
      setResult({
        items: [],
        stopped: true,
        stopReason: 'uncertain',
        remainingReportIds: intent.reports.map((report) => report.id),
      });
      onQueued();
    } finally {
      try {
        assertScope();
        setPending(false);
      } catch {
        /* Discard invalid caller state. */
      }
    }
  };
  // Never render a captured recipient list after actor/workspace/filter invalidation.
  return (
    <Dialog
      open={valid}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('queue_selected_title')}</DialogTitle>
          <DialogDescription>
            {t('queue_selected_description', {
              count: intent?.reports.length ?? 0,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-60 overflow-auto rounded-lg border">
          {valid &&
            intent?.reports.map((report) => (
              <div key={report.id} className="border-b p-3 last:border-b-0">
                <p className="truncate font-medium text-sm">
                  {report.user_name || t('unknown_member')}
                </p>
                <p className="break-all text-muted-foreground text-xs">
                  {report.user_email}
                </p>
                <p className="truncate text-muted-foreground text-xs">
                  {report.title}
                </p>
              </div>
            ))}
        </div>
        <p className="text-muted-foreground text-xs">
          {t('queue_not_sent_notice')}
        </p>
        <div role="status" aria-live="polite" className="min-h-10 text-sm">
          {pending &&
            t('queue_progress', {
              completed: progress?.completed ?? 0,
              total: intent?.reports.length ?? 0,
              queued: progress?.queued ?? 0,
            })}
          {result && (
            <>
              <p>
                {t('queue_completed', {
                  queued: result.items.filter((item) => item.queued).length,
                })}
              </p>
              {result.stopped && (
                <p className="mt-1 text-destructive">{t('queue_stopped')}</p>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t(pending ? 'stop_queueing' : 'close')}
          </Button>
          <Button
            onClick={() => void confirm()}
            disabled={!valid || pending || submitted.current === intent}
          >
            {t('queue_selected_action')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
