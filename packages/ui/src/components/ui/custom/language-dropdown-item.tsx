'use client';

import {
  persistLocalePreference,
  reloadForLocaleChange,
} from './locale-preference';
import { SatelliteLanguageItem } from './satellite-language-item';
import { useLocalePreference } from './use-locale-preference';

interface Props {
  label: string;
  locale: string;
  /** Server-rendered selection, used until the browser cookie is readable. */
  selected?: boolean;
  onLocaleChange?: (locale: string) => Promise<void> | void;
}

export function LanguageDropdownItem({
  label,
  locale,
  selected,
  onLocaleChange,
}: Props) {
  const preference = useLocalePreference();
  const isSelected =
    preference === undefined ? selected : preference === locale;

  const useLocale = async () => {
    if (onLocaleChange) await onLocaleChange(locale);
    else persistLocalePreference(locale);
    reloadForLocaleChange();
  };

  return (
    <SatelliteLanguageItem
      label={label}
      selected={isSelected}
      onSelect={useLocale}
    />
  );
}
