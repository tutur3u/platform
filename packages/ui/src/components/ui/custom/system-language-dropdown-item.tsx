'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { clearLocalePreference } from './locale-preference';
import { SatelliteLanguageItem } from './satellite-language-item';

interface Props {
  selected?: boolean;
  onResetLocale?: () => Promise<void> | void;
}

export function SystemLanguageDropdownItem({ selected, onResetLocale }: Props) {
  const t = useTranslations('common');
  const router = useRouter();

  const useDefaultLocale = async () => {
    if (onResetLocale) {
      await onResetLocale();
      router.refresh();
      return;
    }

    clearLocalePreference();
    router.refresh();
  };

  return (
    <SatelliteLanguageItem
      label={t('system')}
      selected={selected}
      system
      onSelect={useDefaultLocale}
    />
  );
}
