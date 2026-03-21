'use client';

import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function TriggerForm() {
  const t = useTranslations('ws-post-emails');
  const [limit, setLimit] = useState('200');
  const [sendLimit, setSendLimit] = useState('50');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
    data?: Record<string, unknown>;
  } | null>(null);

  const handleTrigger = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const cronSecret = prompt('Enter CRON_SECRET:');
      if (!cronSecret) {
        setIsLoading(false);
        return;
      }

      const params = new URLSearchParams();
      params.set('limit', limit);
      params.set('sendLimit', sendLimit);

      const response = await fetch(
        `/api/cron/process-post-email-queue?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${cronSecret}`,
          },
        }
      );

      const data = await response.json();

      if (data.ok) {
        setResult({
          ok: true,
          message: t('trigger_success'),
          data: {
            claimed: data.claimed,
            processed: data.processed,
            failed: data.failed,
            timedOut: data.timedOut,
            totalDurationMs: data.totalDurationMs,
          },
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
                {t('claimed')}: {result.data.claimed as number}
              </p>
              <p>
                {t('processed')}: {result.data.processed as number}
              </p>
              <p>
                {t('failed')}: {result.data.failed as number}
              </p>
              {(result.data?.timedOut as boolean) && (
                <p className="text-orange-600">{t('timed_out')}</p>
              )}
              <p>
                {t('duration')}:{' '}
                {(result.data.totalDurationMs as number)?.toLocaleString()}ms
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
