import 'package:timezone/data/latest_all.dart' as data;
import 'package:timezone/timezone.dart' as tz;

/// Resolves native IANA aliases as well as canonical preference identifiers.
tz.Location timezoneLocation(String identifier) {
  if (identifier == 'UTC') return tz.UTC;
  if (!tz.timeZoneDatabase.isInitialized ||
      !tz.timeZoneDatabase.locations.containsKey(identifier)) {
    // Another consumer may have initialized the compact database, which omits
    // native aliases such as Asia/Saigon. Keep its configured local location.
    final local = tz.timeZoneDatabase.isInitialized ? tz.local : tz.UTC;
    try {
      data.initializeTimeZones();
    } finally {
      tz.setLocalLocation(local);
    }
  }
  return tz.getLocation(identifier);
}
