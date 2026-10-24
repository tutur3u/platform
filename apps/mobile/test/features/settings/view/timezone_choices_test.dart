import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/settings/view/timezone_choices.dart';

void main() {
  final january = DateTime.utc(2026, 1, 15);

  test('friendly names split city and region', () {
    final zone = TimezoneChoice.fromId(
      'America/Argentina/Buenos_Aires',
      january,
    );
    expect(zone.city, 'Buenos Aires');
    expect(zone.region, 'America · Argentina');
    expect(TimezoneChoice.fromId('UTC', january).region, isEmpty);
    // POSIX Etc zones invert the sign; the title shows the real offset.
    final fixed = TimezoneChoice.fromId('Etc/GMT+12', january);
    expect(fixed.city, 'GMT\u221212');
    expect(fixed.region, isEmpty);
    expect(fixed.matches('etc/gmt+12'), isTrue);
  });

  test('offsets use GMT labels including half hours', () {
    expect(
      TimezoneChoice.fromId('Asia/Ho_Chi_Minh', january).offsetLabel,
      'GMT+7',
    );
    expect(
      TimezoneChoice.fromId('Asia/Kolkata', january).offsetLabel,
      'GMT+5:30',
    );
    expect(
      TimezoneChoice.fromId('America/New_York', january).offsetLabel,
      'GMT−5',
    );
    expect(TimezoneChoice.fromId('UTC', january).offsetLabel, 'GMT');
    expect(TimezoneChoice.fromId('Not/AZone', january).offsetLabel, isEmpty);
  });

  test('search matches city, id and offset spellings', () {
    final zone = TimezoneChoice.fromId('America/New_York', january);
    for (final query in [
      'new york',
      'New_York',
      'america',
      'gmt-5',
      'utc-5',
      '-05:00',
      'GMT−5',
    ]) {
      expect(zone.matches(query), isTrue, reason: query);
    }
    expect(zone.matches('paris'), isFalse);
  });

  test('choices sort west to east', () {
    final choices = buildTimezoneChoices([
      'Asia/Tokyo',
      'UTC',
      'America/New_York',
    ], january);
    expect(choices.map((c) => c.id), ['America/New_York', 'UTC', 'Asia/Tokyo']);
  });
}
