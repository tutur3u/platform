import 'package:timezone/data/latest_all.dart' as data;
import 'package:timezone/timezone.dart' as tz;

/// Resolves native IANA aliases as well as canonical preference identifiers.
tz.Location timezoneLocation(String identifier) {
  if (identifier == 'UTC') return tz.UTC;
  if (!tz.timeZoneDatabase.isInitialized ||
      !tz.timeZoneDatabase.locations.containsKey('Asia/Saigon')) {
    // Asia/Saigon marks the full database; unknown identifiers must not reload it.
    // Preserve the configured local location when upgrading compact fixtures.
    final local = tz.timeZoneDatabase.isInitialized ? tz.local : tz.UTC;
    try {
      data.initializeTimeZones();
    } finally {
      tz.setLocalLocation(local);
    }
  }
  return tz.getLocation(identifier);
}
