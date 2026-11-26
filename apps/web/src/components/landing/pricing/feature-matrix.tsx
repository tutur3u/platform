'use client';

import { CommercialComparison } from '@tuturuuu/ui/commercial-comparison';
import { VersionedPlanComparison } from '@tuturuuu/ui/versioned-plan-comparison';
import { useLocale, useMessages, useTranslations } from 'next-intl';

export function FeatureMatrix({ versioned = false }: { versioned?: boolean }) {
  const messages = useMessages();
  const locale = useLocale();
  const t = useTranslations('landing.pricing');
  if (versioned) {
    return (
      <VersionedPlanComparison
        copy={{
          title: t('versionedComparison.title'),
          feature: t('versionedComparison.feature'),
          credits: t('versionedComparison.credits'),
          voice: t('versionedComparison.voice'),
          boards: t('versionedComparison.boards'),
          storage: t('versionedComparison.storage'),
          meetings: t('versionedComparison.meetings'),
          transcription: t('versionedComparison.transcription'),
          forms: t('versionedComparison.forms'),
          automation: t('versionedComparison.automation'),
          allowance: t('versionedComparison.allowance'),
        }}
        locale={locale}
        names={{
          FREE: t('tiers.free.name'),
          PLUS: t('tiers.plus.name'),
          PRO: t('tiers.pro.name'),
          MAX: 'Max',
          ULTRA: 'Ultra',
        }}
      />
    );
  }
  return <CommercialComparison copy={messages.commercialComparison} />;
}
