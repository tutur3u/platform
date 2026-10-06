import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';
import 'package:mobile/features/calendar/widgets/timeline_zoom_viewport.dart';

import '../../../helpers/helpers.dart';

void main() {
  testWidgets(
    'scope change during pinch cancels old completion and date callbacks',
    (tester) async {
      tester.view.physicalSize = const Size(390, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var scope = Object();
      var callbacks = 0;
      var completed = 0;
      late StateSetter update;
      await tester.pumpApp(
        StatefulBuilder(
          builder: (context, setState) {
            update = setState;
            return MultiDayScheduleView(
              selectedDate: DateTime(2030, 1, 15),
              events: const [],
              visibleDayCount: 3,
              zoomScope: scope,
              onTimelineZoomEnd: (_) => completed++,
              onEventTap: (_) => callbacks++,
              onCreateAtTime: (_) => callbacks++,
              onDaySelected: (_) => callbacks++,
              onSwipe: (_) => callbacks++,
            );
          },
        ),
      );
      await tester.pumpAndSettle();
      var viewport = tester.widget<TimelineZoomViewport>(
        find.byType(TimelineZoomViewport),
      );
      final rect = tester.getRect(find.byKey(viewport.viewportKey));
      final a = await tester.startGesture(
        Offset(rect.left + 90, rect.center.dy),
        pointer: 1,
      );
      final b = await tester.startGesture(
        Offset(rect.left + 220, rect.center.dy),
        pointer: 2,
      );
      await a.moveBy(const Offset(-30, 0));
      await b.moveBy(const Offset(30, 0));
      await tester.pump();
      update(() => scope = Object());
      await tester.pump();
      await a.up();
      await b.up();
      await tester.pumpAndSettle();
      expect(completed, 0);
      expect(callbacks, 0);
      viewport = tester.widget<TimelineZoomViewport>(
        find.byType(TimelineZoomViewport),
      );
      final oldOffset = viewport.verticalController.offset;
      await tester.dragFrom(rect.center, const Offset(0, 100));
      await tester.pumpAndSettle();
      expect(viewport.verticalController.offset, lessThan(oldOffset));
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'control animation preserves midpoint and pinch clamps at bounds',
    (tester) async {
      final controller = ScrollController(initialScrollOffset: 480);
      addTearDown(controller.dispose);
      final viewportKey = GlobalKey();
      var zoom = 1.0;
      final completed = <double>[];
      late StateSetter update;
      await tester.pumpApp(
        StatefulBuilder(
          builder: (context, setState) {
            update = setState;
            return TimelineZoomViewport(
              zoom: zoom,
              baseHourHeight: 60,
              verticalController: controller,
              viewportKey: viewportKey,
              onZoomEnd: completed.add,
              builder: (context, factor, blocked) => SingleChildScrollView(
                key: viewportKey,
                controller: controller,
                child: SizedBox(height: 24 * 60 * factor, width: 390),
              ),
            );
          },
        ),
      );
      await tester.pumpAndSettle();
      final rect = tester.getRect(find.byKey(viewportKey));
      final originalHours = (controller.offset + rect.height / 2) / 60;
      update(() => zoom = 1.8);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 90));
      final midpointOffset = controller.offset;
      await tester.pumpAndSettle();
      expect(controller.offset, greaterThan(midpointOffset));
      expect(
        (controller.offset + rect.height / 2) / 108,
        closeTo(originalHours, 0.001),
      );
      final a = await tester.startGesture(
        rect.center - const Offset(10, 0),
        pointer: 1,
      );
      final b = await tester.startGesture(
        rect.center + const Offset(10, 0),
        pointer: 2,
      );
      await a.moveBy(const Offset(-100, 0));
      await b.moveBy(const Offset(100, 0));
      await tester.pump();
      await a.up();
      await b.up();
      await tester.pumpAndSettle();
      expect(completed.single, 2.5);
      final c = await tester.startGesture(
        rect.center - const Offset(100, 0),
        pointer: 3,
      );
      final d = await tester.startGesture(
        rect.center + const Offset(100, 0),
        pointer: 4,
      );
      await c.moveBy(const Offset(95, 0));
      await d.moveBy(const Offset(-95, 0));
      await tester.pump();
      await c.up();
      await d.up();
      await tester.pumpAndSettle();
      expect(completed.last, 0.65);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('unmount during pinch drops pending completion', (tester) async {
    final controller = ScrollController();
    addTearDown(controller.dispose);
    final viewportKey = GlobalKey();
    var completed = 0;
    await tester.pumpApp(
      TimelineZoomViewport(
        zoom: 1,
        baseHourHeight: 60,
        verticalController: controller,
        viewportKey: viewportKey,
        onZoomEnd: (_) => completed++,
        builder: (context, zoom, blocked) => SingleChildScrollView(
          key: viewportKey,
          controller: controller,
          child: SizedBox(width: 390, height: 1440 * zoom),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final rect = tester.getRect(find.byKey(viewportKey));
    final first = await tester.startGesture(
      rect.center - const Offset(30, 0),
      pointer: 1,
    );
    final second = await tester.startGesture(
      rect.center + const Offset(30, 0),
      pointer: 2,
    );
    await first.moveBy(const Offset(-20, 0));
    await second.moveBy(const Offset(20, 0));
    await tester.pumpApp(const SizedBox());
    await first.up();
    await second.up();
    await tester.pumpAndSettle();
    expect(completed, 0);
    expect(tester.takeException(), isNull);
  });
}
