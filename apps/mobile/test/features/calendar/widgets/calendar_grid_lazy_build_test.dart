import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';

import '../../../helpers/helpers.dart';

final _day = DateTime(2026, 5, 6);

/// One timed event per day across a range wider than the date window.
List<CalendarEvent> _dailyEvents() => [
  for (var offset = -40; offset <= 40; offset++)
    CalendarEvent(
      id: 'day-$offset',
      title: 'day-$offset',
      startAt: _day.add(Duration(days: offset, hours: 9)),
      endAt: _day.add(Duration(days: offset, hours: 10)),
      isAllDayOverride: false,
    ),
];

int _builtDays() => find
    .textContaining('day-', skipOffstage: false)
    .evaluate()
    .map((element) => (element.widget as Text).data)
    .toSet()
    .length;

void main() {
  // Switching into a timeline view used to build every day of its
  // scrollable date window (17 days for three days, 35 for a week) before
  // the first frame. Only visible days and one screen either side build now.
  for (final (visible, window) in [(3, 17), (7, 35)]) {
    testWidgets('a $visible-day grid builds only nearby days of its '
        '$window-day window', (tester) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = Size(visible == 3 ? 390 : 1024, 800);
      addTearDown(tester.view.reset);
      await tester.pumpApp(
        MultiDayScheduleView(
          selectedDate: _day,
          events: _dailyEvents(),
          visibleDayCount: visible,
          onEventTap: (_) {},
          onCreateAtTime: (_) {},
          onDaySelected: (_) {},
          onSwipe: (_) {},
        ),
      );
      await tester.pumpAndSettle();
      final built = _builtDays();
      expect(built, greaterThanOrEqualTo(visible));
      // Visible days plus one screen of cache on each side, and the
      // partially visible edge columns.
      expect(built, lessThanOrEqualTo(visible * 3 + 2));
      expect(built, lessThan(window));
      expect(find.text('day-0'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  test('projected events are shared until the events or zone change', () {
    final events = _dailyEvents();
    final state = CalendarState(events: events, timezone: 'Asia/Ho_Chi_Minh');
    final first = state.displayEvents;
    expect(state.displayEvents, same(first));
    expect(state.copyWith(isRefreshing: true).displayEvents, same(first));
    final otherZone = state.copyWith(timezone: 'Europe/Berlin');
    expect(otherZone.displayEvents, isNot(same(first)));
    final otherEvents = state.copyWith(events: [...events]);
    expect(otherEvents.displayEvents, isNot(same(first)));
    expect(otherEvents.displayEvents, hasLength(events.length));
  });
}
