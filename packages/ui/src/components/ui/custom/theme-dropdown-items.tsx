'use client';
import { useTranslations } from 'next-intl';
import { SatelliteThemeDropdownItems } from './satellite-theme-dropdown-items';
export function ThemeDropdownItems() {
  const t = useTranslations('common');
  return <SatelliteThemeDropdownItems t={t} />;
}
