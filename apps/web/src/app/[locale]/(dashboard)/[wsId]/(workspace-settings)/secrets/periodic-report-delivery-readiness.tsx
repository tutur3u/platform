'use client';

import { CheckCircle2, FileClock, Mail, ShieldAlert } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import SecretForm from './form';

interface PeriodicReportDeliveryReadinessProps {
  existingSecrets: string[];
  globalGateEnabled: boolean;
  periodicGateEnabled: boolean;
  senderConfigured: boolean;
  wsId: string;
}

export function PeriodicReportDeliveryReadiness({
  existingSecrets,
  globalGateEnabled,
  periodicGateEnabled,
  senderConfigured,
  wsId,
}: PeriodicReportDeliveryReadinessProps) {
  const t = useTranslations('ws-secrets.report_delivery');
  const ready = globalGateEnabled && periodicGateEnabled && senderConfigured;

  const checks = [
    { label: t('global_gate'), ready: globalGateEnabled },
    { label: t('periodic_gate'), ready: periodicGateEnabled },
    { label: t('sender'), ready: senderConfigured },
  ];

  return (
    <section className="rounded-xl border bg-card p-3 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background">
            {ready ? (
              <Mail className="size-5 text-dynamic-green" />
            ) : (
              <ShieldAlert className="size-5 text-dynamic-amber" />
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{t('title')}</h2>
              <Badge variant={ready ? 'default' : 'secondary'}>
                {ready ? t('ready') : t('setup_required')}
              </Badge>
            </div>
            <p className="max-w-3xl text-muted-foreground text-sm">
              {t('description')}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <Link href={`/${wsId}/reports?view=automations`}>
            <FileClock className="size-4" />
            {t('open_automations')}
          </Link>
        </Button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {checks.map((check) => (
          <div
            key={check.label}
            className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <CheckCircle2
              className={
                check.ready
                  ? 'size-4 shrink-0 text-dynamic-green'
                  : 'size-4 shrink-0 text-muted-foreground'
              }
            />
            <span className="min-w-0 flex-1 truncate">{check.label}</span>
            <Badge variant="outline">
              {check.ready ? t('configured') : t('missing')}
            </Badge>
          </div>
        ))}
      </div>

      {!periodicGateEnabled && (
        <div className="mt-4 rounded-lg border border-dynamic-amber/30 bg-dynamic-amber/5 p-3">
          <div className="mb-3">
            <p className="font-medium text-sm">{t('enable_title')}</p>
            <p className="text-muted-foreground text-sm">
              {t('enable_description')}
            </p>
          </div>
          <SecretForm
            existingSecrets={existingSecrets}
            initialValues={{
              name: 'ENABLE_REPORT_EMAIL_SENDING',
              value: 'true',
            }}
            nameLocked
            wsId={wsId}
          />
        </div>
      )}

      <p className="mt-4 text-muted-foreground text-xs">{t('safety_note')}</p>
    </section>
  );
}
