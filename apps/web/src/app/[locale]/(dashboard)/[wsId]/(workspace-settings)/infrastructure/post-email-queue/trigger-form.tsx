'use client';

import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type TriggerDiagnostics = {
  phase4SkippedReason?: string | null;
  queueAfter?: {
    failed: number;
    processing: number;
    queued: number;
    sent: number;
  };
  queueBefore?: {
    failed: number;
    processing: number;
    queued: number;
    sent: number;
  };
  reconciliationDiagnostics?: {
    checked: number;
    missingSenderPlatformUser: number;
    orphaned: number;
    upserted: number;
  };
};

type TriggerResponse = {
  claimed?: number;
  diagnostics?: TriggerDiagnostics;
  error?: string;
  failed?: number;
  ok: boolean;
  processed?: number;
  requestId?: string;
  timedOut?: boolean;
  totalDurationMs?: number;
};

export function TriggerForm() {
  const t = useTranslations('ws-post-emails');
  const [cronSecret, setCronSecret] = useState('');
  const [limit, setLimit] = useState('200');
  const [sendLimit, setSendLimit] = useState('50');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    data?: TriggerResponse;
    ok: boolean;
    message: string;
  } | null>(null);

  const handleTrigger = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      if (!cronSecret.trim()) {
        setIsLoading(false);
        return;
      }

      const params = new URLSearchParams();
      params.set('debug', '1');
      params.set('limit', limit);
      params.set('sendLimit', sendLimit);

      const response = await fetch(
        `/api/cron/process-post-email-queue?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${cronSecret.trim()}`,
          },
        }
      );

      const data = (await response.json()) as TriggerResponse;

      if (data.ok) {
        setResult({
          ok: true,
          message: t('trigger_success'),
          data,
        });
      } else {
        setResult({
          ok: false,
          message: data.error || t('trigger_error'),
        });
      }
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : t('trigger_error'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="cronSecret">{t('secret_label')}</Label>
          <Input
            id="cronSecret"
            type="password"
            value={cronSecret}
            onChange={(e) => setCronSecret(e.target.value)}
            placeholder="CRON_SECRET"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="limit">{t('limit_label')}</Label>
          <Input
            id="limit"
            type="number"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            min="1"
            max="500"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sendLimit">{t('send_limit_label')}</Label>
          <Input
            id="sendLimit"
            type="number"
            value={sendLimit}
            onChange={(e) => setSendLimit(e.target.value)}
            min="1"
            max="200"
          />
        </div>
      </div>

      <Button onClick={handleTrigger} disabled={isLoading}>
        {isLoading ? t('running') : t('run_now')}
      </Button>

      {result && (
        <div
          className={`rounded-lg p-4 ${
            result.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          <p className="font-medium">{result.message}</p>
          {result.data && (
            <div className="mt-2 text-sm">
              <p>
                {t('request_id')}: {result.data.requestId ?? '-'}
              </p>
              <p>
                {t('claimed')}: {result.data.claimed ?? 0}
              </p>
              <p>
                {t('processed')}: {result.data.processed ?? 0}
              </p>
              <p>
                {t('failed')}: {result.data.failed ?? 0}
              </p>
              {(result.data?.timedOut ?? false) && (
                <p className="text-orange-600">{t('timed_out')}</p>
              )}
              <p>
                {t('duration')}:{' '}
                {(result.data.totalDurationMs ?? 0).toLocaleString()}ms
              </p>
              <p className="mt-3 font-medium">{t('reconciliation')}</p>
              <p>
                {t('checked')}:&nbsp;
                {result.data.diagnostics?.reconciliationDiagnostics?.checked ??
                  0}
              </p>
              <p>
                {t('orphaned')}:&nbsp;
                {result.data.diagnostics?.reconciliationDiagnostics?.orphaned ??
                  0}
              </p>
              <p>
                {t('upserted')}:&nbsp;
                {result.data.diagnostics?.reconciliationDiagnostics?.upserted ??
                  0}
              </p>
              <p>
                {t('missing_sender_platform_user')}:&nbsp;
                {result.data.diagnostics?.reconciliationDiagnostics
                  ?.missingSenderPlatformUser ?? 0}
              </p>
              <p>
                {t('phase4_skipped_reason')}:&nbsp;
                {result.data.diagnostics?.phase4SkippedReason
                  ? t(
                      result.data.diagnostics
                        .phase4SkippedReason as 'phase4_skipped_reason_no_queued_or_failed_rows_after_reconciliation'
                    )
                  : '-'}
              </p>
              <p className="mt-3 font-medium">{t('queue_before')}</p>
              <p>
                {t('queued')}:{' '}
                {result.data.diagnostics?.queueBefore?.queued ?? 0}
                {' • '}
                {t('processing')}:{' '}
                {result.data.diagnostics?.queueBefore?.processing ?? 0}
                {' • '}
                {t('failed')}:{' '}
                {result.data.diagnostics?.queueBefore?.failed ?? 0}
                {' • '}
                {t('sent')}: {result.data.diagnostics?.queueBefore?.sent ?? 0}
              </p>
              <p className="mt-3 font-medium">{t('queue_after')}</p>
              <p>
                {t('queued')}:{' '}
                {result.data.diagnostics?.queueAfter?.queued ?? 0}
                {' • '}
                {t('processing')}:&nbsp;
                {result.data.diagnostics?.queueAfter?.processing ?? 0}
                {' • '}
                {t('failed')}:{' '}
                {result.data.diagnostics?.queueAfter?.failed ?? 0}
                {' • '}
                {t('sent')}: {result.data.diagnostics?.queueAfter?.sent ?? 0}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
