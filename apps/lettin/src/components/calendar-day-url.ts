import {
  getPortlessInternalAppUrl,
  PRODUCTION_INTERNAL_APP_DOMAINS,
} from '@tuturuuu/utils/internal-domains';

const workspaceId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Navigate by a calendar day only; never transfer notebook identifiers or text. */
export function calendarDayUrl(wsId: string, locale: string, day: string) {
  if (
    !(['personal', 'internal'].includes(wsId) || workspaceId.test(wsId)) ||
    !['en', 'vi'].includes(locale) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(day)
  )
    return null;
  const date = new Date(`${day}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== day
  )
    return null;
  const production = PRODUCTION_INTERNAL_APP_DOMAINS.find(
    (app) => app.name === 'calendar'
  )!.url;
  const origin =
    process.env.NODE_ENV === 'development'
      ? (getPortlessInternalAppUrl('calendar') ?? production)
      : production;
  const url = new URL(`/${locale}/${wsId}`, origin);
  url.searchParams.set('date', day);
  return url.toString();
}
