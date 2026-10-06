import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/widgets/calendar_zoom_sheet.dart';
import 'package:mobile/features/calendar/widgets/date_snap_scroll_physics.dart';
import 'package:mobile/features/calendar/widgets/day_schedule_view.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';
import 'package:mobile/features/calendar/widgets/timeline_zoom_viewport.dart';

import '../../../helpers/helpers.dart';

void main() {
  for (final multi in [false, true]) {
    for (final afterDrag in [false, true]) {
      testWidgets(
        'pinch preserves focal time and restores scroll $multi/$afterDrag',
        (tester) async {
          tester.view.physicalSize = const Size(390, 800);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final date = DateTime(2030, 1, 15);
          var callbacks = 0;
          final completed = <double>[];
          final event = CalendarEvent(
            id: 'fixture',
            title: 'Fixture',
            startAt: date.add(const Duration(hours: 10)),
            endAt: date.add(const Duration(hours: 11)),
          );
          await tester.pumpApp(
            multi
                ? MultiDayScheduleView(
                    selectedDate: date,
                    events: [event],
                    visibleDayCount: 3,
                    onEventTap: (_) => callbacks++,
                    onCreateAtTime: (_) => callbacks++,
                    onDaySelected: (_) => callbacks++,
                    onSwipe: (_) => callbacks++,
                    onTimelineZoomEnd: completed.add,
                  )
                : DayScheduleView(
                    selectedDate: date,
                    timedEvents: [event],
                    allDayEvents: const [],
                    onEventTap: (_) => callbacks++,
                    onCreateAtTime: (_) => callbacks++,
                    onSwipe: (_) => callbacks++,
                    onTimelineZoomEnd: completed.add,
                  ),
          );
          await tester.pumpAndSettle();
          final viewport = tester.widget<TimelineZoomViewport>(
            find.byType(TimelineZoomViewport),
          );
          final rect = tester.getRect(find.byKey(viewport.viewportKey));
          final firstPoint = Offset(rect.left + 90, rect.center.dy);
          final first = await tester.startGesture(firstPoint, pointer: 1);
          if (afterDrag) {
            await first.moveBy(const Offset(0, -30));
            await tester.pump();
          }
          final firstY = firstPoint.dy - (afterDrag ? 30 : 0);
          final secondPoint = Offset(rect.left + 220, firstY);
          final second = await tester.startGesture(secondPoint, pointer: 2);
          final focalY = firstY - rect.top;
          final originalHours =
              (viewport.verticalController.offset + focalY) /
              viewport.baseHourHeight;
          await first.moveTo(Offset(rect.left + 57.5, firstY));
          await second.moveTo(Offset(rect.left + 252.5, firstY));
          await tester.pump();
          expect(completed, isEmpty);
          // Initial span130, new span195: exactly1.5x with fixed focal point.
          expect(
            (viewport.verticalController.offset + focalY) /
                (viewport.baseHourHeight * 1.5),
            closeTo(originalHours, 0.02),
          );
          await first.up();
          await second.up();
          await tester.pumpAndSettle();
          expect(completed.single, closeTo(1.5, 0.001));
          expect(callbacks, 0);
          final before = viewport.verticalController.offset;
          await tester.dragFrom(rect.center, const Offset(0, -100));
          await tester.pumpAndSettle();
          expect(viewport.verticalController.offset, greaterThan(before));
          if (multi) {
            final grid = viewport.horizontalControllers.last;
            final horizontalViews = tester
                .widgetList<SingleChildScrollView>(
                  find.byType(SingleChildScrollView),
                )
                .where((view) => view.scrollDirection == Axis.horizontal);
            final dayWidth =
                (horizontalViews.first.physics! as DateSnapScrollPhysics)
                    .dayWidth;
            await tester.dragFrom(rect.center, const Offset(-180, 0));
            await tester.pumpAndSettle();
            expect(callbacks, greaterThan(0));
            expect(
              grid.offset / dayWidth,
              closeTo((grid.offset / dayWidth).roundToDouble(), 0.001),
            );
            for (final horizontal in viewport.horizontalControllers.where(
              (item) => item.hasClients,
            )) {
              expect(horizontal.offset, closeTo(grid.offset, 0.5));
            }
          } else {
            await tester.flingFrom(rect.center, const Offset(150, 0), 500);
            await tester.pumpAndSettle();
            expect(callbacks, greaterThan(0));
          }
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
  testWidgets('accessible controls clamp and reset with large text', (
    tester,
  ) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final changed = <double>[];
    await tester.pumpApp(
      Builder(
        builder: (context) => TextButton(
          onPressed: () =>
              showCalendarZoomSheet(context, zoom: 2.5, onChanged: changed.add),
          child: const Text('Open zoom'),
        ),
      ),
    );
    await tester.tap(find.text('Open zoom'));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<IconButton>(find.widgetWithIcon(IconButton, Icons.zoom_in))
          .onPressed,
      isNull,
    );
    await tester.tap(find.text('Reset'));
    await tester.pumpAndSettle();
    expect(changed, [1]);
    await tester.tap(find.byTooltip('Zoom out'));
    await tester.pumpAndSettle();
    expect(changed.last, closeTo(1 / 1.2, 0.001));
    expect(
      tester.getSize(find.byTooltip('Zoom out')).height,
      greaterThanOrEqualTo(48),
    );
    expect(tester.takeException(), isNull);
  });
}
