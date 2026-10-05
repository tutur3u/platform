import windowsZones from 'cldr-core/supplemental/windowsZones.json';

const defaults = new Map(
  windowsZones.supplemental.windowsZones.mapTimezones
    .filter(({ mapZone }) => mapZone._territory === '001')
    .map(({ mapZone }) => [mapZone._other, mapZone._type])
);

/** Graph uses Windows zone names. CLDR territory 001 defines their canonical
 * default IANA mapping; never infer offsets or fall back to the machine zone.
 * https://unicode.org/reports/tr35/tr35-dates.html#Windows_Zones */
export function microsoftCalendarTimeZone(timeZone: string): string {
  const candidate = defaults.get(timeZone) ?? timeZone;
  try {
    return new Intl.DateTimeFormat('en', {
      timeZone: candidate,
    }).resolvedOptions().timeZone;
  } catch {
    throw new RangeError('Unsupported Microsoft calendar time zone');
  }
}
