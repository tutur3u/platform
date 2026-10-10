import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/widgets/date_snap_scroll_physics.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';
import 'package:mobile/features/calendar/widgets/timeline_zoom_viewport.dart';

import '../../../helpers/helpers.dart';

void main() {
  for (final date in [calendarDate(2026, 3, 8), calendarDate(2026, 11)]) {
    testWidgets('mouse and keyboard snap to civil dates $date', (tester) async {
      tester.view.physicalSize = const Size(390, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var selected = date;
      final changes = <int>[];
      await tester.pumpApp(
        StatefulBuilder(
          builder: (context, update) => MultiDayScheduleView(
            selectedDate: selected,
            events: const [],
            visibleDayCount: 3,
            onEventTap: (_) {},
            onCreateAtTime: (_) {},
            onDaySelected: (date) => update(() => selected = date),
            onSwipe: (delta) {
              changes.add(delta);
              update(() => selected = selected.add(Duration(days: delta)));
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      final horizontal = find.byWidgetPredicate(
        (widget) =>
            widget is SingleChildScrollView &&
            widget.scrollDirection == Axis.horizontal,
      );
      final grid = horizontal.last;
      final view = tester.widget<SingleChildScrollView>(grid);
      final dayWidth = (view.physics! as DateSnapScrollPhysics).dayWidth;
      final viewport = tester.widget<TimelineZoomViewport>(
        find.byType(TimelineZoomViewport),
      );
      final timeOffset = viewport.verticalController.offset;
      final before = view.controller!.offset;
      await tester.sendEventToBinding(
        PointerScrollEvent(
          position: tester.getCenter(grid),
          scrollDelta: Offset(dayWidth * 0.75, 0),
        ),
      );
      await tester.pumpAndSettle();
      expect(view.controller!.offset, closeTo(before + dayWidth, 0.001));
      expect(selected, date.add(const Duration(days: 1)));
      expect(changes, [1]);

      // Existing date headers are keyboard controls. Activate a visible date
      // rather than treating directional focus traversal as a date shortcut.
      final target = date.add(const Duration(days: 2));
      final headerDate = find.text('${target.day}');
      Focus.of(tester.element(headerDate)).requestFocus();
      await tester.pump();
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();
      expect(selected, target);
      expect(changes, [1]);
      expect(viewport.verticalController.offset, timeOffset);
      for (final controller in viewport.horizontalControllers.where(
        (controller) => controller.hasClients,
      )) {
        expect(controller.offset, closeTo(view.controller!.offset, 0.001));
        expect(
          controller.offset / dayWidth,
          closeTo((controller.offset / dayWidth).roundToDouble(), 0.001),
        );
      }
      expect(tester.takeException(), isNull);
    });
  }
}
