import 'package:flutter/foundation.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

/// A timezone presented with a friendly city name and its current GMT offset.
@immutable
class TimezoneChoice {
  TimezoneChoice({
    required this.id,
    required this.city,
    required this.region,
    required this.offset,
  }) : _searchKey = _buildSearchKey(id, city, region, offset);

  /// From an IANA id: `America/Argentina/Buenos_Aires` becomes the city
  /// "Buenos Aires" in region "America · Argentina".
  ///
  /// Fixed `Etc/GMT±N` zones invert the POSIX sign, so they are titled by
  /// their real offset ("Etc/GMT+12" is "GMT−12") instead of their id.
  factory TimezoneChoice.fromId(String id, DateTime now) {
    final parts = id.split('/').map((part) => part.replaceAll('_', ' '));
    final segments = parts.toList();
    final offset = timezoneOffset(id, now);
    final fixed = id.startsWith('Etc/') && offset != null;
    return TimezoneChoice(
      id: id,
      city: fixed ? formatGmtOffset(offset) : segments.last,
      region: fixed || segments.length == 1
          ? ''
          : segments.sublist(0, segments.length - 1).join(' · '),
      offset: offset,
    );
  }

  final String id;
  final String city;
  final String region;

  /// Offset from UTC at the time the list was built; `null` when unknown.
  final Duration? offset;

  String get offsetLabel => formatGmtOffset(offset);

  /// Case-insensitive match on id, city, region and offset spellings such as
  /// "gmt+7", "utc+7", "+7" and "+07:00".
  bool matches(String query) {
    final q = normalizeTimezoneQuery(query);
    if (q.isEmpty) return true;
    return _searchKey.contains(q);
  }

  final String _searchKey;

  static String _buildSearchKey(
    String id,
    String city,
    String region,
    Duration? offset,
  ) {
    final offsetKeys = offset == null
        ? ''
        : [
            formatGmtOffset(offset, ascii: true),
            formatGmtOffset(offset, ascii: true).replaceFirst('gmt', 'utc'),
            formatGmtOffset(offset, ascii: true, padded: true),
          ].join(' ');
    return normalizeTimezoneQuery('$id $city $region $offsetKeys');
  }
}

String normalizeTimezoneQuery(String value) =>
    value.trim().toLowerCase().replaceAll('_', ' ').replaceAll('−', '-');

bool _databaseReady = false;

/// Current UTC offset of [id], or `null` if the zone is unknown.
Duration? timezoneOffset(String id, DateTime now) {
  if (id == 'UTC') return Duration.zero;
  if (!_databaseReady) {
    tz_data.initializeTimeZones();
    _databaseReady = true;
  }
  try {
    final zone = tz.getLocation(id).timeZone(now.millisecondsSinceEpoch);
    return zone.offset;
  } on Object {
    return null;
  }
}

/// "GMT+7", "GMT−3:30", "GMT". [ascii] uses "-" and lower case for search
/// keys; [padded] renders "+07:00".
String formatGmtOffset(
  Duration? offset, {
  bool ascii = false,
  bool padded = false,
}) {
  if (offset == null) return '';
  final prefix = ascii ? 'gmt' : 'GMT';
  final minutes = offset.inMinutes;
  if (minutes == 0 && !padded) return prefix;
  final sign = minutes < 0 ? (ascii ? '-' : '−') : '+';
  final hours = minutes.abs() ~/ 60;
  final rest = minutes.abs() % 60;
  if (padded) {
    return '$sign${hours.toString().padLeft(2, '0')}:'
        '${rest.toString().padLeft(2, '0')}';
  }
  final tail = rest == 0 ? '' : ':${rest.toString().padLeft(2, '0')}';
  return '$prefix$sign$hours$tail';
}

/// Choices sorted west to east, then by city.
List<TimezoneChoice> buildTimezoneChoices(Iterable<String> ids, DateTime now) {
  final choices = [for (final id in ids) TimezoneChoice.fromId(id, now)]
    ..sort((a, b) {
      final byOffset = (a.offset ?? Duration.zero).compareTo(
        b.offset ?? Duration.zero,
      );
      return byOffset != 0 ? byOffset : a.city.compareTo(b.city);
    });
  return choices;
}
