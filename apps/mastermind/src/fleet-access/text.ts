import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { FLEET_TIME_ZONE, type Locale, localePath, useI18n } from '../i18n';

export type FleetText = typeof en.fleetAccess;

const bundles: Record<Locale, FleetText> = {
  en: en.fleetAccess,
  vi: vi.fleetAccess,
};

/** The `fleetAccess` messages for the shell's locale. */
export function useFleetText() {
  const { locale } = useI18n();
  return { locale, t: bundles[locale] };
}

/** Worker `/login`, then back to this locale's Fleet page. */
export function fleetSignInHref(locale: Locale) {
  return `/login?nextUrl=${encodeURIComponent(localePath(locale, '/fleet-access'))}`;
}

export function fill(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}

/** Date and time in the fleet's zone, so server and client render alike. */
export function formatInstant(locale: Locale, value: string) {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: FLEET_TIME_ZONE,
  }).format(new Date(value));
}
