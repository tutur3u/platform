import type { Timezone } from '@tuturuuu/types/primitives/Timezone';
import timezones from '@tuturuuu/utils/timezones';

/** Zone families that never name a place people pick as their own time zone. */
const NON_CIVIL_PREFIXES = ['Antarctica/', 'Etc/'];

function detectedTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** A zone's UTC offset in hours at `at`, or undefined when Intl cannot tell. */
export function zoneOffsetHours(zone: string, at: Date = new Date()) {
  try {
    const name = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value;
    const match = name?.match(/^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/u);
    if (!match) return undefined;
    if (!match[1]) return 0;
    const hours = Number(match[2]) + Number(match[3] ?? 0) / 60;
    return match[1] === '-' ? -hours : hours;
  } catch {
    return undefined;
  }
}

/** Whether a zone names a city in a group label such as "(UTC+07:00) Bangkok, Hanoi". */
function namedInLabel(zone: string, group: Timezone) {
  const city = zone.split('/').at(-1)?.replaceAll('_', ' ').toLowerCase();
  return !!city && group.text.toLowerCase().includes(city);
}

/** The offset a group label states, such as -6 for "(UTC-06:00) Guadalajara". */
function labelOffsetHours(group: Timezone) {
  const match = group.text.match(/^\(UTC(?:([+-])(\d{2}):(\d{2}))?\)/u);
  if (!match) return undefined;
  if (!match[1]) return 0;
  const hours = Number(match[2]) + Number(match[3]) / 60;
  return match[1] === '-' ? -hours : hours;
}

/**
 * Whether a zone sits at the group's offset in either half of the year. The
 * picker data stores daylight-saving groups at their summer offset and a few
 * groups at stale offsets, so both the stored offset and the offset the label
 * states count, checked in January and July.
 */
function onGroupOffset(zone: string, group: Timezone, at: Date) {
  const year = at.getUTCFullYear();
  const targets = [group.offset, labelOffsetHours(group)];
  return [0, 6].some((month) => {
    const offset = zoneOffsetHours(
      zone,
      new Date(Date.UTC(year, month, 15, 12))
    );
    return offset !== undefined && targets.includes(offset);
  });
}

/**
 * The group a stored IANA zone belongs to. A zone listed in several groups
 * resolves to the group whose label names its city, then to the group whose
 * offset matches the zone's offset at `at`, then to the first listed.
 */
export function timezoneGroup(
  iana: string | null | undefined,
  groups: readonly Timezone[] = timezones as Timezone[],
  at: Date = new Date()
) {
  if (!iana) return undefined;
  const matches = groups.filter((group) => group.utc.includes(iana));
  if (matches.length < 2) return matches[0];
  const offset = zoneOffsetHours(iana, at);
  return (
    matches.find((group) => namedInLabel(iana, group)) ??
    matches.find((group) => group.offset === offset) ??
    matches[0]
  );
}

/**
 * The IANA zone a plan saves for a picked offset group. The browser's own
 * zone wins when it is in the group. Otherwise civil zones at the group's
 * offset in either half of the year are preferred, the one named in the
 * group label first and then in list order; then any civil zone, then the
 * first listed. Pass `null` to skip detection.
 */
export function planTimezoneFor(
  group: Timezone | null | undefined,
  detected: string | null | undefined = detectedTimezone(),
  at: Date = new Date()
) {
  if (!group?.utc.length) return undefined;
  if (detected && group.utc.includes(detected)) return detected;
  const civil = group.utc.filter(
    (zone) => !NON_CIVIL_PREFIXES.some((prefix) => zone.startsWith(prefix))
  );
  const onOffset = civil.filter((zone) => onGroupOffset(zone, group, at));
  const named = (zone: string) => namedInLabel(zone, group);
  return (
    onOffset.find(named) ??
    onOffset[0] ??
    civil.find(named) ??
    civil[0] ??
    group.utc[0]
  );
}

/** What a plan shows for its stored zone: the picker's group label when known. */
export function planTimezoneLabel(iana: string | null | undefined) {
  if (!iana) return undefined;
  return timezoneGroup(iana)?.text ?? iana;
}
