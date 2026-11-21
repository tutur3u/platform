import { FLEET_TIME_ZONE, type Locale } from '../i18n';

/** Deploy time in ICT, e.g. `21 Nov 23:58`. */
export function formatShipTime(locale: Locale, iso: string) {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: FLEET_TIME_ZONE,
  }).format(new Date(iso));
}
