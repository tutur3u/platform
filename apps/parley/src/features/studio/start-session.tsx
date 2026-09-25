'use client';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { startScenario } from './actions';
export function StartSession({ scenarioId }: { scenarioId: string }) {
  const t = useTranslations('parley');
  const [consent, setConsent] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-4"
      action={(data) =>
        startTransition(async () => {
          await startScenario(data);
        })
      }
    >
      <input type="hidden" name="scenario_id" value={scenarioId} />
      <label className="flex items-start gap-3 text-sm leading-relaxed">
        <input
          type="checkbox"
          name="consent"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 size-4 shrink-0 accent-primary"
        />
        <span>{t('consent')}</span>
      </label>
      <Button className="w-full" disabled={pending || !consent}>
        {t(pending ? 'starting' : 'start')}
      </Button>
    </form>
  );
}
