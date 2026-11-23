'use client';

import { useTranslations } from 'next-intl';
import {
  clearLocalePreference,
  reloadForLocaleChange,
} from './locale-preference';
import { SatelliteLanguageItem } from './satellite-language-item';
import { useLocalePreference } from './use-locale-preference';

interface Props {
  /** Server-rendered selection, used until the browser cookie is readable. */
  selected?: boolean;
  onResetLocale?: () => Promise<void> | void;
}

export function SystemLanguageDropdownItem({ selected, onResetLocale }: Props) {
  const t = useTranslations('common');
  const preference = useLocalePreference();
  const isSelected = preference === undefined ? selected : preference === null;

  const useDefaultLocale = async () => {
    if (onResetLocale) await onResetLocale();
    else clearLocalePreference();
    reloadForLocaleChange(null);
  };

  return (
    <SatelliteLanguageItem
      label={t('system')}
      selected={isSelected}
      system
      onSelect={useDefaultLocale}
    />
  );
}
