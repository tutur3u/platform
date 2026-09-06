'use client';

import { useRouter } from 'next/navigation';
import { persistLocalePreference } from './locale-preference';
import { SatelliteLanguageItem } from './satellite-language-item';

interface Props {
  label: string;
  locale: string;
  selected?: boolean;
  onLocaleChange?: (locale: string) => Promise<void> | void;
}

export function LanguageDropdownItem({
  label,
  locale,
  selected,
  onLocaleChange,
}: Props) {
  const router = useRouter();

  const useLocale = async () => {
    if (onLocaleChange) {
      await onLocaleChange(locale);
      router.refresh();
      return;
    }

    persistLocalePreference(locale);
    router.refresh();
  };

  return (
    <SatelliteLanguageItem
      label={label}
      selected={selected}
      onSelect={useLocale}
    />
  );
}
