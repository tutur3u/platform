import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';

void main() {
  test('writes wall time with the zone offset, never as UTC', () {
    final wall = calendarDate(2026, 10, 26, 9);
    expect(
      calendarWallIso8601(wall, 'Asia/Ho_Chi_Minh'),
      '2026-10-26T09:00:00+07:00',
    );
    expect(
      calendarWallIso8601(wall, 'America/New_York'),
      '2026-10-26T09:00:00-04:00',
    );
    expect(
      calendarWallIso8601(calendarDate(2026, 12, 1, 9, 30), 'America/New_York'),
      '2026-12-01T09:30:00-05:00',
    );
    expect(
      calendarWallIso8601(calendarDate(2026, 10, 26, 9), 'Asia/Kolkata'),
      '2026-10-26T09:00:00+05:30',
    );
    expect(calendarWallIso8601(wall, 'UTC'), '2026-10-26T09:00:00+00:00');
  });

  test('a wall time skipped by a DST change is written without an offset', () {
    // 02:30 does not exist in New York on 2026-03-08.
    expect(
      calendarWallIso8601(calendarDate(2026, 3, 8, 2, 30), 'America/New_York'),
      '2026-03-08T02:30:00',
    );
  });

  test('parses back to the same instant', () {
    final wall = calendarDate(2026, 10, 26, 9);
    final written = calendarWallIso8601(wall, 'Asia/Ho_Chi_Minh');
    expect(
      DateTime.parse(
        written,
      ).isAtSameMomentAs(calendarWallToUtc(wall, 'Asia/Ho_Chi_Minh')),
      isTrue,
    );
  });
}
