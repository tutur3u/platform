'use client';

import type { EmployeeRestorationConsumer } from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

export function EmployeeRestorationDetails({
  view,
  onInspect,
}: {
  view: EmployeeRestorationConsumer['view'];
  onInspect: () => void;
}) {
  const t = useTranslations('internal-accounts.restoration');
  const detail = view.detail;
  return (
    <details>
      <summary className="cursor-pointer text-sm">{t('advanced')}</summary>
      <Button
        type="button"
        variant="outline"
        disabled={view.busy || view.outcome === 'denied'}
        onClick={onInspect}
      >
        {view.busy ? t('working') : t('inspect')}
      </Button>
      {detail ? (
        <div className="space-y-2 text-sm" aria-live="polite">
          <dl className="grid grid-cols-2 gap-2">
            <dt>{t('registry')}</dt>
            <dd>{t(`registry_states.${detail.registryState}`)}</dd>
            <dt>{t('provider')}</dt>
            <dd>{t(`provider_states.${detail.providerState}`)}</dd>
            <dt>{t('observed_at')}</dt>
            <dd>{detail.providerReadAt}</dd>
            {detail.operation ? (
              <>
                <dt>{t('operation')}</dt>
                <dd className="break-all">{detail.operation.operationId}</dd>
                <dt>{t('phase')}</dt>
                <dd>{t(`phases.${detail.operation.phase}`)}</dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : null}
      {view.retained?.operationId && !detail ? (
        <p className="break-all text-sm">
          {t('retained_operation', {
            operationId: view.retained.operationId,
          })}
        </p>
      ) : null}
    </details>
  );
}
