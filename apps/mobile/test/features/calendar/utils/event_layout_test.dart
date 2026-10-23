import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/event_layout.dart';

final _day = DateTime(2030, 1, 15);
CalendarEvent _event(String id, int startSeconds, int endSeconds) =>
    CalendarEvent(
      id: id,
      startAt: _day.add(Duration(seconds: startSeconds)),
      endAt: _day.add(Duration(seconds: endSeconds)),
    );

void main() {
  const minimum = Duration(minutes: 32, seconds: 29);

  test('adjacent 30-minute event after true overlap regains full width', () {
    final result = calculateEventLayout([
      _event('long', 9 * 3600, 10 * 3600),
      _event('short', 9 * 3600 + 30 * 60, 10 * 3600),
      _event('adjacent', 10 * 3600, 10 * 3600 + 30 * 60),
    ], minimumDuration: minimum);

    expect(result.map((e) => e.totalColumns), [2, 2, 1]);
    expect(result.map((e) => e.column), [0, 1, 0]);
    expect(result[1].paintDuration, const Duration(minutes: 30));
  });

  test(
    'fractional actual overlap survives while disconnected groups split',
    () {
      final result = calculateEventLayout([
        _event('a', 0, 1800),
        _event('b', 1799, 1801),
        _event('c', 1801, 1802),
        _event('d', 1802, 1803),
      ], minimumDuration: minimum);

      expect(result.map((e) => e.totalColumns), [2, 2, 1, 1]);
      expect(result.map((e) => e.column), [0, 1, 0, 0]);
      expect(result[1].paintDuration, const Duration(seconds: 2));
      expect(result[2].paintDuration, const Duration(seconds: 1));
      expect(result.last.paintDuration, minimum);
    },
  );

  test('columns are reused at real ends inside a transitive component', () {
    final result = calculateEventLayout([
      _event('a', 0, 600),
      _event('bridge', 300, 2400),
      _event('c', 600, 1200),
    ], minimumDuration: minimum);

    expect(result.map((e) => e.totalColumns), [2, 2, 2]);
    expect(result.map((e) => e.column), [0, 1, 0]);
    expect(result.first.paintDuration, const Duration(minutes: 10));
  });
}
