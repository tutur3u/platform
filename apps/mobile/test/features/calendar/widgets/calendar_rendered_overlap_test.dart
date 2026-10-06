import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/widgets/day_schedule_view.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';

import '../../../helpers/helpers.dart';

final day = DateTime(2030, 1, 15);
CalendarEvent event(String id, int start, int end) => CalendarEvent(
  id: id,
  title: id,
  startAt: day.add(Duration(minutes: start)),
  endAt: day.add(Duration(minutes: end)),
);

void main() {
  for (final multi in [false, true]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets(
        'rendered short events remain separately tappable $multi/$scale',
        (tester) async {
          tester.view.physicalSize = const Size(390, 800);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final events = [
            event('first', 540, 545),
            event('overlap', 540, 545),
            event('next', 545, 550),
            event('isolated', 660, 690),
          ];
          final tapped = <String>[];
          await tester.pumpApp(
            Builder(
              builder: (context) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: TextScaler.linear(scale)),
                child: multi
                    ? MultiDayScheduleView(
                        selectedDate: day,
                        events: events,
                        onEventTap: (e) => tapped.add(e.id),
                        onCreateAtTime: (_) {},
                        onDaySelected: (_) {},
                        onSwipe: (_) {},
                        visibleDayCount: 3,
                      )
                    : DayScheduleView(
                        selectedDate: day,
                        allDayEvents: const [],
                        timedEvents: events,
                        onEventTap: (e) => tapped.add(e.id),
                        onCreateAtTime: (_) {},
                        onSwipe: (_) {},
                      ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          Rect card(String title) => tester.getRect(
            find
                .ancestor(
                  of: find.text(title),
                  matching: find.byType(Positioned),
                )
                .first,
          );
          final first = card('first');
          final next = card('next');
          expect(first.overlaps(next), isFalse);
          expect(card('isolated').width, greaterThan(first.width * 2));
          await tester.tapAt(Offset(first.center.dx, first.bottom - 3));
          expect(tapped, ['first']);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
  for (final multi in [false, true]) {
    testWidgets('fractional start clears prior painted card $multi', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(390, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final start = day.add(const Duration(hours: 9));
      final events = [
        CalendarEvent(
          id: 'a',
          title: 'earlier',
          startAt: start,
          endAt: start.add(const Duration(seconds: 1)),
        ),
        CalendarEvent(
          id: 'b',
          title: 'later',
          startAt: start.add(
            Duration(minutes: multi ? 45 : 29, seconds: multi ? 14 : 47),
          ),
          endAt: start.add(const Duration(hours: 1)),
        ),
      ];
      await tester.pumpApp(
        Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(1.8)),
            child: Theme(
              data: Theme.of(context).copyWith(
                textTheme: Theme.of(context).textTheme.copyWith(
                  labelSmall: const TextStyle(fontSize: 12, height: 1.1),
                  labelMedium: const TextStyle(fontSize: 14, height: 1.1),
                ),
              ),
              child: multi
                  ? MultiDayScheduleView(
                      selectedDate: day,
                      events: events,
                      visibleDayCount: 3,
                      onEventTap: (_) {},
                      onCreateAtTime: (_) {},
                      onDaySelected: (_) {},
                      onSwipe: (_) {},
                    )
                  : DayScheduleView(
                      selectedDate: day,
                      allDayEvents: const [],
                      timedEvents: events,
                      onEventTap: (_) {},
                      onCreateAtTime: (_) {},
                      onSwipe: (_) {},
                    ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      Rect card(String text) => tester.getRect(
        find
            .ancestor(of: find.text(text), matching: find.byType(Positioned))
            .first,
      );
      expect(card('earlier').overlaps(card('later')), false);
      expect(card('later').width, closeTo(card('earlier').width, 0.001));
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('scaled all-day gutter stays single-line', (tester) async {
    tester.view.physicalSize = const Size(390, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpApp(
      Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(2)),
          child: MultiDayScheduleView(
            selectedDate: day,
            events: [event('all', 0, 1440).copyWith(isAllDayOverride: true)],
            visibleDayCount: 3,
            onEventTap: (_) {},
            onCreateAtTime: (_) {},
            onDaySelected: (_) {},
            onSwipe: (_) {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final label = tester.widget<Text>(find.text('All day'));
    expect(label.maxLines, 1);
    expect(label.softWrap, false);
    expect(tester.takeException(), isNull);
  });
}
