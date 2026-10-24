import 'package:timezone/data/latest.dart' as data;
import 'package:timezone/timezone.dart' as tz;

/// Uses the same database for preference resolution and calendar projection.
/// An identifier must resolve before preferences can be marked usable by UI.
tz.Location timezoneLocation(String identifier) {
  if (identifier == 'UTC') return tz.UTC;
  if (!tz.timeZoneDatabase.isInitialized) data.initializeTimeZones();
  return tz.getLocation(identifier);
}
