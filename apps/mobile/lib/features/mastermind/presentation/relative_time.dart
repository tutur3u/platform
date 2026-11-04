import 'package:intl/intl.dart';
import 'package:mobile/core/utils/timezone_label.dart';
import 'package:mobile/core/utils/timezone_location.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:timezone/timezone.dart' as tz;

/// The zone Mastermind times are shown in when no preference is resolved.
const mastermindDefaultTimeZone = 'Asia/Ho_Chi_Minh';

/// Seconds on either side of now that still read as "now".
const _nowWindow = Duration(seconds: 45);

/// A relative age in the bucket the label shows it as.
sealed class MastermindRelativeTime {
  const MastermindRelativeTime();
}

final class RelativeNow extends MastermindRelativeTime {
  const RelativeNow();
}

final class RelativeMinutes extends MastermindRelativeTime {
  const RelativeMinutes(this.count);
  final int count;
}

final class RelativeHours extends MastermindRelativeTime {
  const RelativeHours(this.count);
  final int count;
}

final class RelativeDays extends MastermindRelativeTime {
  const RelativeDays(this.count);
  final int count;
}

/// A week or older: the label shows a short date instead of an age.
final class RelativeDate extends MastermindRelativeTime {
  const RelativeDate();
}

/// Buckets [at] against [now]: within 45 s either way is "now", then whole
/// minutes under an hour, whole hours under a day, whole days under a week,
/// and a date from then on. A future [at] (clock skew) never counts up.
MastermindRelativeTime mastermindRelativeTime(DateTime at, DateTime now) {
  final age = now.toUtc().difference(at.toUtc());
  if (age < _nowWindow) return const RelativeNow();
  if (age.inMinutes < 60) {
    return RelativeMinutes(age.inMinutes < 1 ? 1 : age.inMinutes);
  }
  if (age.inHours < 24) return RelativeHours(age.inHours);
  if (age.inDays < 7) return RelativeDays(age.inDays);
  return const RelativeDate();
}

/// [zone] when the tz database knows it, else the default zone.
String mastermindResolvedTimeZone(String? zone) {
  if (zone == null || zone.isEmpty || zone == 'auto') {
    return mastermindDefaultTimeZone;
  }
  try {
    timezoneLocation(zone);
  } on tz.LocationNotFoundException {
    return mastermindDefaultTimeZone;
  }
  return zone;
}

/// Wall time of [at] in [zone], as a UTC-flagged value whose fields read as
/// that zone, independent of the device zone. The offset is taken at the
/// instant itself, so zones with daylight saving stay right.
DateTime mastermindWallTime(DateTime at, String zone) {
  final utc = at.toUtc();
  final offset = timezoneLocation(
    mastermindResolvedTimeZone(zone),
  ).timeZone(utc.millisecondsSinceEpoch).offset;
  return utc.add(offset);
}

/// "29 Oct", or "29 Oct 2025" when the year is not [now]'s in [zone].
String mastermindShortDate(
  DateTime at, {
  required DateTime now,
  required String zone,
  required String locale,
}) {
  final wall = mastermindWallTime(at, zone);
  final sameYear = wall.year == mastermindWallTime(now, zone).year;
  return DateFormat(sameYear ? 'd MMM' : 'd MMM yyyy', locale).format(wall);
}

/// The compact visible value: "now", "5m", "2h", "3d", then a short date.
String mastermindRelativeTimeText(
  AppLocalizations l10n,
  DateTime at, {
  required DateTime now,
  required String zone,
  required String locale,
}) => switch (mastermindRelativeTime(at, now)) {
  RelativeNow() => l10n.mastermindTimeNow,
  RelativeMinutes(:final count) => l10n.mastermindTimeMinutesShort(count),
  RelativeHours(:final count) => l10n.mastermindTimeHoursShort(count),
  RelativeDays(:final count) => l10n.mastermindTimeDaysShort(count),
  RelativeDate() => mastermindShortDate(
    at,
    now: now,
    zone: zone,
    locale: locale,
  ),
};

/// "29 Oct, 09:21 GMT+7": the tooltip, in the user's zone.
String mastermindAbsoluteTimeText(
  DateTime at, {
  required DateTime now,
  required String zone,
  required String locale,
}) {
  final resolved = mastermindResolvedTimeZone(zone);
  final wall = mastermindWallTime(at, resolved);
  final date = mastermindShortDate(
    at,
    now: now,
    zone: resolved,
    locale: locale,
  );
  final time = DateFormat('HH:mm', locale).format(wall);
  final offset = timezoneOffset(resolved, at: at) ?? 'GMT';
  return '$date, $time $offset';
}

/// "29 October 09:21 GMT+7": the absolute time as a screen reader says it,
/// with the offset so the zone is never implied.
String mastermindSpokenAbsoluteTime(
  DateTime at, {
  required DateTime now,
  required String zone,
  required String locale,
}) {
  final resolved = mastermindResolvedTimeZone(zone);
  final wall = mastermindWallTime(at, resolved);
  final sameYear = wall.year == mastermindWallTime(now, resolved).year;
  final text = DateFormat(
    sameYear ? 'd MMMM HH:mm' : 'd MMMM yyyy HH:mm',
    locale,
  ).format(wall);
  return '$text ${timezoneOffset(resolved, at: at) ?? 'GMT'}';
}

/// "5 minutes ago, 29 October 09:21 GMT+7": the semantics label. A date-old
/// value has no spoken age, so it is the absolute time alone.
String mastermindSpokenTime(
  AppLocalizations l10n,
  DateTime at, {
  required DateTime now,
  required String zone,
  required String locale,
}) {
  final absolute = mastermindSpokenAbsoluteTime(
    at,
    now: now,
    zone: zone,
    locale: locale,
  );
  final relative = switch (mastermindRelativeTime(at, now)) {
    RelativeNow() => l10n.mastermindTimeSpokenNow,
    RelativeMinutes(:final count) => l10n.mastermindTimeSpokenMinutes(count),
    RelativeHours(:final count) => l10n.mastermindTimeSpokenHours(count),
    RelativeDays(:final count) => l10n.mastermindTimeSpokenDays(count),
    RelativeDate() => null,
  };
  return relative == null
      ? absolute
      : l10n.mastermindTimeSpoken(relative, absolute);
}
