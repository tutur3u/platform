import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/utils/timezone_location.dart';
import 'package:timezone/timezone.dart' as tz;

void main() {
  test('first native timezone lookup initializes the complete database', () {
    expect(tz.timeZoneDatabase.isInitialized, isFalse);
    final alias = timezoneLocation('Asia/Saigon');
    expect(
      tz.TZDateTime.from(DateTime.utc(2030), alias).timeZoneOffset,
      const Duration(hours: 7),
    );
    expect(tz.local, same(tz.UTC));
  });
}
