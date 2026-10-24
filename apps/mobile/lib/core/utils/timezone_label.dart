import 'package:mobile/core/utils/timezone_location.dart';
import 'package:timezone/timezone.dart' as tz;

/// Ids whose last segment is not a readable city: renamed zones and POSIX
/// rules.
const _cityAliases = <String, String>{
  'Africa/Asmera': 'Asmara',
  'America/Coral_Harbour': 'Atikokan',
  'America/Godthab': 'Nuuk',
  'America/Santa_Isabel': 'Tijuana',
  'Asia/Calcutta': 'Kolkata',
  'Asia/Ho_Chi_Minh': 'Ho Chi Minh City',
  'Asia/Katmandu': 'Kathmandu',
  'Asia/Rangoon': 'Yangon',
  'Asia/Saigon': 'Ho Chi Minh City',
  'Atlantic/Faeroe': 'Faroe',
  'CST6CDT': 'Central Time',
  'EST5EDT': 'Eastern Time',
  'Europe/Kiev': 'Kyiv',
  'MST7MDT': 'Mountain Time',
  'PST8PDT': 'Pacific Time',
  'Pacific/Enderbury': 'Kanton',
  'Pacific/Ponape': 'Pohnpei',
  'Pacific/Truk': 'Chuuk',
};

/// Ids that name a time standard rather than a city.
const _standards = {'UTC', 'Etc/UTC', 'Etc/GMT', 'GMT'};

/// City shown for [zone], such as "Ho Chi Minh City" for `Asia/Saigon`.
///
/// [localizedCities] overrides the English exemplar city for a canonical
/// display name (keyed by the English name).
String timezoneCity(
  String zone, {
  Map<String, String> localizedCities = const {},
}) {
  final english =
      _cityAliases[zone] ?? zone.split('/').last.replaceAll('_', ' ');
  return localizedCities[english] ?? english;
}

/// UTC offset of [zone] at [at], formatted as `GMT+7`, `GMT+5:30` or `GMT`.
/// Returns null when the zone is not in the tz database.
String? timezoneOffset(String zone, {DateTime? at}) {
  if (_standards.contains(zone)) return 'GMT';
  final Duration offset;
  try {
    // Resolves native aliases such as Asia/Saigon (see timezone_location).
    offset = timezoneLocation(
      zone,
    ).timeZone((at ?? DateTime.now()).millisecondsSinceEpoch).offset;
  } on tz.LocationNotFoundException {
    return null;
  }
  if (offset == Duration.zero) return 'GMT';
  final sign = offset.isNegative ? '-' : '+';
  final minutes = offset.inMinutes.abs();
  final hours = minutes ~/ 60;
  final rest = minutes % 60;
  return rest == 0
      ? 'GMT$sign$hours'
      : 'GMT$sign$hours:${rest.toString().padLeft(2, '0')}';
}

/// Name of an IANA [zone] without its offset: a city such as
/// "Ho Chi Minh City", "UTC", or the offset itself for POSIX `Etc/GMT` zones.
String timezoneName(
  String zone, {
  DateTime? at,
  Map<String, String> localizedCities = const {},
}) {
  if (_standards.contains(zone)) return 'UTC';
  if (zone.startsWith('Etc/GMT')) {
    // POSIX sign: Etc/GMT-7 is seven hours ahead of UTC.
    return timezoneOffset(zone, at: at) ?? zone;
  }
  return timezoneCity(zone, localizedCities: localizedCities);
}

/// Whether [timezoneName] already states the offset, so it is not repeated.
bool _nameIsOffset(String zone) =>
    _standards.contains(zone) || zone.startsWith('Etc/GMT');

/// One-line, human label for an IANA [zone]: "Ho Chi Minh City (GMT+7)".
///
/// The offset is joined with a non-breaking space so it never wraps away
/// from its city, and the raw identifier is never split at `/` or `_`.
String timezoneLabel(
  String zone, {
  DateTime? at,
  Map<String, String> localizedCities = const {},
}) {
  final name = timezoneName(zone, at: at, localizedCities: localizedCities);
  if (_nameIsOffset(zone)) return name;
  final offset = timezoneOffset(zone, at: at);
  return offset == null ? name : '$name\u00a0($offset)';
}
