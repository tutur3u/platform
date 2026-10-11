import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/widgets/day_schedule_view.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';
import 'package:mobile/features/calendar/widgets/timeline_zoom_viewport.dart';

import '../../../helpers/helpers.dart';

void main() {
  for (final multi in [false, true]) {
    testWidgets('reduced motion applies anchored zoom immediately $multi', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(390, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var zoom = 1.0;
      var disableAnimations = true;
      late StateSetter update;
      final date = calendarDate(2030, 3, 10);
      var dateChanges = 0;
      await tester.pumpApp(
        StatefulBuilder(
          builder: (context, setState) {
            update = setState;
            return MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(disableAnimations: disableAnimations),
              child: multi
                  ? MultiDayScheduleView(
                      selectedDate: date,
                      events: const [],
                      visibleDayCount: 3,
                      timelineZoom: zoom,
                      onEventTap: (_) {},
                      onCreateAtTime: (_) {},
                      onDaySelected: (_) => dateChanges++,
                      onSwipe: (_) => dateChanges++,
                    )
                  : DayScheduleView(
                      selectedDate: date,
                      allDayEvents: const [],
                      timedEvents: const [],
                      timelineZoom: zoom,
                      onEventTap: (_) {},
                      onCreateAtTime: (_) {},
                      onSwipe: (_) => dateChanges++,
                    ),
            );
          },
        ),
      );
      await tester.pumpAndSettle();
      final viewport = tester.widget<TimelineZoomViewport>(
        find.byType(TimelineZoomViewport),
      );
      final controller = viewport.verticalController;
      final focalY =
          tester.getSize(find.byKey(viewport.viewportKey)).height / 2;
      final anchorHours =
          (controller.offset + focalY) / viewport.baseHourHeight;
      final dates = viewport.horizontalControllers
          .where((controller) => controller.hasClients)
          .map((controller) => controller.offset)
          .toList();

      void expectAnchor(double factor) {
        expect(
          (controller.offset + focalY) / (viewport.baseHourHeight * factor),
          closeTo(anchorHours, 0.001),
        );
        expect(
          viewport.horizontalControllers
              .where((controller) => controller.hasClients)
              .map((controller) => controller.offset),
          dates,
        );
        expect(dateChanges, 0);
      }

      update(() => zoom = 1.5);
      await tester.pump();
      expectAnchor(1.5);
      expect(tester.hasRunningAnimations, isFalse);

      // Turning reduced motion on during a control transition also finishes
      // at its target without changing the original wall-clock anchor.
      update(() => disableAnimations = false);
      await tester.pump();
      update(() => zoom = 1.8);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 60));
      expect(tester.hasRunningAnimations, isTrue);
      update(() => disableAnimations = true);
      await tester.pump();
      expectAnchor(1.8);
      expect(tester.hasRunningAnimations, isFalse);
      await tester.pump(const Duration(milliseconds: 200));
      expectAnchor(1.8);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('day initial time positioning respects reduced motion', (
    tester,
  ) async {
    await tester.pumpApp(
      Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(context).copyWith(disableAnimations: true),
          child: DayScheduleView(
            selectedDate: calendarDate(2030, 1, 15),
            allDayEvents: const [],
            timedEvents: const [],
            onEventTap: (_) {},
            onCreateAtTime: (_) {},
            onSwipe: (_) {},
          ),
        ),
      ),
    );
    final viewport = tester.widget<TimelineZoomViewport>(
      find.byType(TimelineZoomViewport),
    );
    expect(
      viewport.verticalController.offset,
      closeTo(8 * viewport.baseHourHeight, 0.001),
    );
    expect(tester.hasRunningAnimations, isFalse);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
