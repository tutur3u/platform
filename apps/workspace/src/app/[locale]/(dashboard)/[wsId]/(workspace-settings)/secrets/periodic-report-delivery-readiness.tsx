'use client';

import { CheckCircle2, FileClock, Mail, ShieldAlert } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
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
    <SettingsSection>
      <SettingItemTab
        description={t('description')}
        icon={
          ready ? (
            <Mail className="size-4 text-dynamic-green" />
          ) : (
            <ShieldAlert className="size-4 text-dynamic-amber" />
          )
        }
        title={
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span>{t('title')}</span>
            <Badge
              className={
                ready
                  ? 'border-dynamic-green/30 text-dynamic-green'
                  : 'border-dynamic-amber/30 text-dynamic-amber'
              }
              variant="outline"
            >
              {ready ? t('ready') : t('setup_required')}
            </Badge>
          </div>
        }
      >
        <Button asChild size="sm" variant="outline">
          <Link href={`/${wsId}/reports?view=automations`}>
            <FileClock className="size-4" />
            {t('open_automations')}
          </Link>
        </Button>
      </SettingItemTab>

      {checks.map((check) => (
        <SettingItemTab
          icon={
            <CheckCircle2
              className={check.ready ? 'size-4 text-dynamic-green' : 'size-4'}
            />
          }
          key={check.label}
          title={check.label}
        >
          <Badge variant="outline">
            {check.ready ? t('configured') : t('missing')}
          </Badge>
        </SettingItemTab>
      ))}

      {!periodicGateEnabled && (
        <SettingItemTab
          layout="stacked"
          description={t('enable_description')}
          title={t('enable_title')}
        >
          <SecretForm
            existingSecrets={existingSecrets}
            initialValues={{
              name: 'ENABLE_REPORT_EMAIL_SENDING',
              value: 'true',
            }}
            nameLocked
            submitClassName="ml-auto flex w-fit"
            wsId={wsId}
          />
        </SettingItemTab>
      )}

      <SettingsSectionMessage className="py-4">
        {t('safety_note')}
      </SettingsSectionMessage>
    </SettingsSection>
  );
}
