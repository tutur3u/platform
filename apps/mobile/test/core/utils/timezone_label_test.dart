import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/utils/supported_timezones.dart';
import 'package:mobile/core/utils/timezone_label.dart';

void main() {
  final winter = DateTime.utc(2026, 1, 15);
  final summer = DateTime.utc(2026, 7, 15);

  test('labels cities with their offset, joined by a non-breaking space', () {
    expect(
      timezoneLabel('Asia/Ho_Chi_Minh', at: winter),
      'Ho Chi Minh City\u00a0(GMT+7)',
    );
    expect(
      timezoneLabel('Asia/Kolkata', at: winter),
      'Kolkata\u00a0(GMT+5:30)',
    );
    expect(
      timezoneLabel('Asia/Kathmandu', at: winter),
      'Kathmandu\u00a0(GMT+5:45)',
    );
    expect(
      timezoneLabel('America/Argentina/Buenos_Aires', at: winter),
      'Buenos Aires\u00a0(GMT-3)',
    );
  });

  test('legacy device ids resolve to the current city and offset', () {
    expect(
      timezoneLabel('Asia/Saigon', at: winter),
      'Ho Chi Minh City\u00a0(GMT+7)',
    );
    expect(
      timezoneLabel('Asia/Calcutta', at: winter),
      'Kolkata\u00a0(GMT+5:30)',
    );
    expect(timezoneLabel('Europe/Kiev', at: winter), 'Kyiv\u00a0(GMT+2)');
  });

  test('offsets follow daylight saving time', () {
    expect(
      timezoneLabel('America/New_York', at: winter),
      'New York\u00a0(GMT-5)',
    );
    expect(
      timezoneLabel('America/New_York', at: summer),
      'New York\u00a0(GMT-4)',
    );
    expect(timezoneLabel('Europe/London', at: winter), 'London\u00a0(GMT)');
    expect(timezoneLabel('Europe/London', at: summer), 'London\u00a0(GMT+1)');
  });

  test('time standards and POSIX Etc zones read as offsets', () {
    expect(timezoneLabel('UTC'), 'UTC');
    expect(timezoneLabel('Etc/UTC'), 'UTC');
    // POSIX sign: Etc/GMT-7 is seven hours ahead of UTC.
    expect(timezoneLabel('Etc/GMT-7', at: winter), 'GMT+7');
    expect(timezoneLabel('Etc/GMT+12', at: winter), 'GMT-12');
  });

  test('localized city names replace the English exemplar', () {
    expect(
      timezoneLabel(
        'Asia/Saigon',
        at: winter,
        localizedCities: const {'Ho Chi Minh City': 'TP. Hồ Chí Minh'},
      ),
      'TP. Hồ Chí Minh\u00a0(GMT+7)',
    );
  });

  test('unknown zones fall back to a readable city without an offset', () {
    expect(timezoneLabel('Mars/Olympus_Mons'), 'Olympus Mons');
    expect(timezoneOffset('Mars/Olympus_Mons'), isNull);
  });

  test(
    'every supported timezone resolves to an offset and a readable name',
    () {
      for (final zone in supportedTimezones) {
        expect(timezoneOffset(zone, at: winter), isNotNull, reason: zone);
        final label = timezoneLabel(zone, at: winter);
        expect(label, isNot(contains('/')), reason: zone);
        expect(label, isNot(contains('_')), reason: zone);
      }
    },
  );
}
