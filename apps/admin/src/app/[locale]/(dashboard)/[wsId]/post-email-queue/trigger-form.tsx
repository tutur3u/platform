'use client';

import { useMutation } from '@tanstack/react-query';
import { LoaderCircle, Send } from '@tuturuuu/icons';
import {
  type BackendInfrastructurePostEmailQueueRunNowResponse,
  runBackendInfrastructurePostEmailQueue,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function TriggerForm({
  defaultLimit,
  defaultSendLimit,
}: {
  defaultLimit: number;
  defaultSendLimit: number;
}) {
  const t = useTranslations('ws-post-emails');
  const [limit, setLimit] = useState(String(defaultLimit));
  const [sendLimit, setSendLimit] = useState(String(defaultSendLimit));
  const [result, setResult] =
    useState<BackendInfrastructurePostEmailQueueRunNowResponse | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      runBackendInfrastructurePostEmailQueue({
        limit,
        sendLimit,
      }),
    onSuccess: (data) => setResult(data),
    onError: (error) =>
      setResult({
        error: error instanceof Error ? error.message : t('trigger_error'),
        ok: false,
      }),
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
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

      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? (
          <LoaderCircle className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <Send className="mr-1 h-4 w-4" />
        )}
        {mutation.isPending ? t('running') : t('run_now')}
      </Button>

      {result && (
        <div
          className={cn(
            'rounded-lg border p-4',
            result.ok
              ? 'border-dynamic-green/25 bg-dynamic-green/10 text-dynamic-green'
              : 'border-dynamic-red/25 bg-dynamic-red/10 text-dynamic-red'
          )}
        >
          <p className="font-medium">
            {result.ok
              ? t('trigger_success')
              : result.error || t('trigger_error')}
          </p>
          {result.ok && (
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <p>
                {t('request_id')}: {result.requestId ?? '-'}
              </p>
              <p>
                {t('duration')}:{' '}
                {(result.totalDurationMs ?? 0).toLocaleString()}ms
              </p>
              <p>
                {t('claimed')}: {result.claimed ?? 0}
              </p>
              <p>
                {t('processed')}: {result.processed ?? 0}
              </p>
              <p>
                {t('failed')}: {result.failed ?? 0}
              </p>
              {(result.timedOut ?? false) && <p>{t('timed_out')}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
