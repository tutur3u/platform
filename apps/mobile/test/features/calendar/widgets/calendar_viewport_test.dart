import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/event_layout.dart';
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
  test('isolated and adjacent components regain full width', () {
    final layout = calculateEventLayout([
      event('a', 480, 540),
      event('b', 500, 560),
      event('adjacent', 560, 600),
      event('isolated', 720, 780),
    ]);
    expect(layout.map((e) => e.totalColumns), [2, 2, 1, 1]);
  });
  test('transitive overlap stays in one component', () {
    final layout = calculateEventLayout([
      event('a', 480, 540),
      event('b', 520, 600),
      event('c', 580, 640),
      event('isolated', 720, 780),
    ]);
    expect(layout.map((e) => e.totalColumns), [2, 2, 2, 1]);
  });
  for (final count in [3, 7]) {
    testWidgets('all-day label visible and dates snap in $count-day view', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(390, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpApp(
        MultiDayScheduleView(
          selectedDate: day,
          events: [
            CalendarEvent(
              id: 'span',
              title: 'Visible all-day label',
              isAllDayOverride: true,
              startAt: day.subtract(const Duration(days: 12)),
              endAt: day.add(const Duration(days: 20)),
            ),
          ],
          onEventTap: (_) {},
          onCreateAtTime: (_) {},
          onDaySelected: (_) {},
          onSwipe: (_) {},
          visibleDayCount: count,
        ),
      );
      await tester.pumpAndSettle();
      final label = find.text('Visible all-day label');
      final initialRect = tester.getRect(label);
      expect(initialRect.left, greaterThanOrEqualTo(52));
      expect(initialRect.right, lessThanOrEqualTo(390));
      final scroller = find
          .byWidgetPredicate(
            (w) =>
                w is SingleChildScrollView &&
                w.scrollDirection == Axis.horizontal,
          )
          .first;
      await tester.drag(scroller, const Offset(-53, 0));
      await tester.pumpAndSettle();
      final offsets = tester
          .widgetList<SingleChildScrollView>(find.byType(SingleChildScrollView))
          .where((w) => w.scrollDirection == Axis.horizontal)
          .map((w) => w.controller!.offset)
          .toList();
      final width = count == 3 ? (390 - 52) / 3 : 112.0;
      expect(
        offsets[0] / width,
        closeTo((offsets[0] / width).roundToDouble(), 0.001),
      );
      for (final offset in offsets) {
        expect(offset, closeTo(offsets.first, 0.001));
      }
      final movedRect = tester.getRect(label);
      expect(movedRect.left, greaterThanOrEqualTo(52));
      expect(movedRect.right, lessThanOrEqualTo(390));
      expect(tester.takeException(), isNull);
    });
  }
  for (final width in [230.0, 390.0]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('all-day clipping remains readable at $width/$scale', (
        tester,
      ) async {
        tester.view.physicalSize = Size(width, 800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        CalendarEvent? tapped;
        await tester.pumpApp(
          Builder(
            builder: (context) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(scale)),
              child: MultiDayScheduleView(
                selectedDate: day,
                events: [
                  CalendarEvent(
                    id: 'wide',
                    title: 'Across the visible viewport',
                    isAllDayOverride: true,
                    startAt: day.subtract(const Duration(days: 12)),
                    endAt: day.add(const Duration(days: 20)),
                    schedulingMetadata: const {
                      'google_event_type': 'workingLocation',
                      'google_working_location_type': 'homeOffice',
                    },
                  ),
                  CalendarEvent(
                    id: 'edge',
                    title: 'Near the right clipping edge',
                    isAllDayOverride: true,
                    startAt: day.add(const Duration(days: 1)),
                    endAt: day.add(const Duration(days: 2)),
                  ),
                ],
                onEventTap: (event) => tapped = event,
                onCreateAtTime: (_) {},
                onDaySelected: (_) {},
                onSwipe: (_) {},
                visibleDayCount: 7,
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        final title = find.text('Across the visible viewport');
        expect(tester.getRect(title).left, greaterThanOrEqualTo(52));
        expect(tester.getRect(title).right, lessThanOrEqualTo(width));
        expect(find.text('All day'), findsOneWidget);
        await tester.tap(title);
        await tester.pumpAndSettle();
        expect(tapped?.id, 'wide');
        final rows = tester.getRect(title);
        final other = tester.getRect(find.text('Near the right clipping edge'));
        expect(other.top, greaterThanOrEqualTo(rows.bottom));
        expect(tester.takeException(), isNull);
      });
    }
  }
  for (var surface = 0; surface < 3; surface++) {
    testWidgets('surface $surface snaps without interrupting navigation', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(390, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var selected = day;
      var calls = 0;
      late StateSetter update;
      await tester.pumpApp(
        StatefulBuilder(
          builder: (context, setState) {
            update = setState;
            return MultiDayScheduleView(
              selectedDate: selected,
              events: [
                CalendarEvent(
                  id: 'span',
                  title: 'Continuous all-day span',
                  isAllDayOverride: true,
                  startAt: day.subtract(const Duration(days: 100)),
                  endAt: day.add(const Duration(days: 100)),
                ),
              ],
              onEventTap: (_) {},
              onCreateAtTime: (_) {},
              onDaySelected: (_) {},
              onSwipe: (delta) => update(() {
                calls++;
                selected = selected.add(Duration(days: delta));
              }),
              visibleDayCount: 7,
            );
          },
        ),
      );
      await tester.pumpAndSettle();
      final horizontal = find.byWidgetPredicate(
        (w) =>
            w is SingleChildScrollView && w.scrollDirection == Axis.horizontal,
      );
      final scroll = horizontal.at(surface);
      final gesture = await tester.startGesture(tester.getCenter(scroll));
      await gesture.moveBy(const Offset(-20, 0));
      await tester.pump();
      await gesture.moveBy(const Offset(-60, 0));
      await tester.pump();
      expect(calls, 0);
      final during = tester
          .widget<SingleChildScrollView>(scroll)
          .controller!
          .offset;
      expect((during / 112 - (during / 112).round()).abs(), greaterThan(0.01));
      await gesture.up();
      await tester.pumpAndSettle();
      for (final view in tester.widgetList<SingleChildScrollView>(horizontal)) {
        expect(
          view.controller!.offset / 112,
          closeTo((view.controller!.offset / 112).roundToDouble(), 0.001),
        );
      }
      expect(calls, 1);
      final extent = tester
          .widget<SingleChildScrollView>(horizontal.last)
          .controller!
          .position
          .maxScrollExtent;
      // Explicit date navigation centers the window.
      // It must not emit a swipe callback.
      update(() => selected = day.add(const Duration(days: 35)));
      await tester.pumpAndSettle();
      final views = tester
          .widgetList<SingleChildScrollView>(horizontal)
          .toList();
      for (final view in views) {
        expect(view.controller!.offset, closeTo(14 * 112, 0.001));
      }
      expect(views.last.controller!.position.maxScrollExtent, extent);
      expect(calls, 1);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('exact backing edge recenters to an aligned continuous window', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    var selected = day;
    await tester.pumpApp(
      StatefulBuilder(
        builder: (context, update) => MultiDayScheduleView(
          selectedDate: selected,
          events: const [],
          visibleDayCount: 7,
          onEventTap: (_) {},
          onCreateAtTime: (_) {},
          onDaySelected: (_) {},
          onSwipe: (delta) =>
              update(() => selected = selected.add(Duration(days: delta))),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final horizontal = find.byWidgetPredicate(
      (w) => w is SingleChildScrollView && w.scrollDirection == Axis.horizontal,
    );
    final grid = tester
        .widget<SingleChildScrollView>(horizontal.last)
        .controller!;
    final extent = grid.position.maxScrollExtent;
    grid.jumpTo(extent);
    await tester.pumpAndSettle();
    expect(
      grid.offset / 112,
      closeTo((grid.offset / 112).roundToDouble(), 0.001),
    );
    expect(grid.position.maxScrollExtent, extent);
    expect(selected.isAfter(day), isTrue);
    expect(
      tester.widget<SingleChildScrollView>(horizontal.first).controller!.offset,
      closeTo(grid.offset, 0.001),
    );
    expect(tester.takeException(), isNull);
  });
}
