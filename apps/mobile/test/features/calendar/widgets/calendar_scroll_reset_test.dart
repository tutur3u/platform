import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/widgets/agenda_view.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';
import 'package:mobile/features/calendar/widgets/timeline_zoom_viewport.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';

import '../../../helpers/helpers.dart';

void main() {
  for (final preference in FirstDayOfWeek.values) {
    test('week preference ${preference.name} preserves locale resolution', () {
      final settings = CalendarSettingsState(userPreference: preference);
      final expected = switch (preference) {
        FirstDayOfWeek.auto_ || FirstDayOfWeek.monday => 1,
        FirstDayOfWeek.sunday => 0,
        FirstDayOfWeek.saturday => 6,
      };
      expect(settings.resolvedFirstDayIndex('vi'), expected);
      if (preference == FirstDayOfWeek.auto_) {
        expect(settings.resolvedFirstDayIndex('en'), 0);
        expect(settings.resolvedFirstDayIndex('ar'), 6);
      }
    });
  }

  for (final reduced in [false, true]) {
    testWidgets('Agenda already-today reset restores Now (reduced $reduced)', (
      tester,
    ) async {
      final now = DateTime.utc(2030, 1, 1, 12);
      var generation = 0;
      late StateSetter update;
      final events = List.generate(
        40,
        (i) => CalendarEvent(
          id: 'synthetic-$i',
          title: 'Scheduled event $i',
          startAt: DateTime.utc(2030, 1, 1, 8, i * 3),
          endAt: DateTime.utc(2030, 1, 1, 8, i * 3 + 2),
        ),
      );
      await tester.pumpApp(
        StatefulBuilder(
          builder: (context, setState) {
            update = setState;
            return MediaQuery(
              data: MediaQuery.of(context).copyWith(disableAnimations: reduced),
              child: CalendarWallClock(
                now: now,
                child: AgendaView(
                  selectedDate: calendarDate(2030),
                  events: events,
                  resetGeneration: generation,
                  onEventTap: (_) {},
                  onDaySelected: (_) {},
                ),
              ),
            );
          },
        ),
      );
      await tester.pumpAndSettle();
      final controller = tester
          .widget<ListView>(find.byType(ListView))
          .controller!;
      final initial = controller.offset;
      expect(initial, greaterThan(0));
      for (var i = 0; i < 3; i++) {
        controller.jumpTo(0);
        update(() => generation++);
        await tester.pumpAndSettle();
        expect(controller.offset, closeTo(initial, 0.1));
      }
      update(() => generation++);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      expect(tester.takeException(), isNull);
    });
  }

  for (final count in [1, 3, 7]) {
    for (final firstDay in count == 7 ? [0, 1, 6] : [0]) {
      for (final reducedMotion in [false, true]) {
        testWidgets(
          '$count dates/$firstDay reset repeated today (reduced $reducedMotion)',
          (tester) async {
            tester.view.physicalSize = const Size(390, 844);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
            // Tuesday at the year boundary exercises preceding-week/year anchoring.
            final now = calendarWallDate(
              DateTime.utc(2030, 1, 1, 18),
              'Pacific/Kiritimati',
            );
            final today = calendarDate(now.year, now.month, now.day);
            final anchor = count == 7
                ? today.subtract(
                    Duration(days: (today.weekday % 7 - firstDay + 7) % 7),
                  )
                : today;
            var generation = 0;
            DateTime? tapped;
            late StateSetter update;
            await tester.pumpApp(
              StatefulBuilder(
                builder: (context, setState) {
                  update = setState;
                  return MediaQuery(
                    data: MediaQuery.of(
                      context,
                    ).copyWith(disableAnimations: reducedMotion),
                    child: CalendarWallClock(
                      now: now,
                      child: MultiDayScheduleView(
                        selectedDate: today,
                        events: const [],
                        visibleDayCount: count,
                        alignToWeekStart: count == 7,
                        firstDayOfWeek: firstDay,
                        resetGeneration: generation,
                        onEventTap: (_) {},
                        onCreateAtTime: (_) {},
                        onDaySelected: (date) => tapped = date,
                        onSwipe: (_) {},
                      ),
                    ),
                  );
                },
              ),
            );
            await tester.pumpAndSettle();
            final horizontal = find.byWidgetPredicate(
              (widget) =>
                  widget is SingleChildScrollView &&
                  widget.scrollDirection == Axis.horizontal,
            );
            final header = horizontal.first;
            final initial = tester
                .widget<SingleChildScrollView>(header)
                .controller!
                .offset;
            final state = tester.state(find.byType(MultiDayScheduleView));
            for (var tap = 0; tap < 3; tap++) {
              final viewport = tester.widget<TimelineZoomViewport>(
                find.byType(TimelineZoomViewport),
              );
              viewport.verticalController.jumpTo(0);
              viewport.horizontalControllers.last.jumpTo(initial + 100);
              update(() => generation++);
              await tester.pump();
              if (reducedMotion) {
                expect(viewport.verticalController.offset, greaterThan(0));
              }
              await tester.pumpAndSettle();
              expect(viewport.verticalController.offset, greaterThan(0));
              final attached = viewport.horizontalControllers
                  .where((c) => c.hasClients)
                  .toList();
              expect(
                attached,
                hasLength(2),
              ); // Header and grid; no all-day rows.
              for (final controller in attached) {
                expect(controller.offset, closeTo(initial, 0.1));
              }
              expect(
                tester.state(find.byType(MultiDayScheduleView)),
                same(state),
              );
            }
            final rect = tester.getRect(header);
            // Tap the first visible header cell through its actual InkWell.
            final dayWidth = (rect.width - 60) / count;
            await tester.tapAt(
              Offset(rect.left + 60 + dayWidth / 2, rect.top + 35),
            );
            await tester.pump();
            expect(tapped, anchor);
            // Immediate route disposal must not use reset controllers.
            update(() => generation++);
            await tester.pumpWidget(const SizedBox.shrink());
            await tester.pump();
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  }
}
