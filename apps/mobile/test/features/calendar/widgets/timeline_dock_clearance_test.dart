import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/calendar/widgets/day_schedule_view.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';

import '../../../helpers/helpers.dart';

/// Dock clearance the calendar page passes through to its full-bleed canvas.
const double _clearance = 96;
const Size _phone = Size(390, 844);
final DateTime _day = DateTime(2030, 1, 15);

Finder get _timeline => find.byWidgetPredicate(
  (widget) =>
      widget is SingleChildScrollView &&
      widget.scrollDirection == Axis.vertical,
);

Future<void> _pumpTimeline(WidgetTester tester, Widget timeline) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = _phone;
  addTearDown(tester.view.reset);
  await tester.pumpApp(
    Builder(
      builder: (context) => MediaQuery(
        data: MediaQuery.of(
          context,
        ).copyWith(padding: const EdgeInsets.only(bottom: _clearance)),
        child: timeline,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Scrolls the timeline to its end and expects the 24-hour grid to stop the
/// dock clearance above the viewport bottom.
Future<void> _expectLastHourClearsDock(WidgetTester tester) async {
  final scrollView = tester.widget<SingleChildScrollView>(_timeline);
  expect(scrollView.padding?.resolve(TextDirection.ltr).bottom, _clearance);
  final controller = scrollView.controller!;
  controller.jumpTo(controller.position.maxScrollExtent);
  await tester.pump();

  final viewport = tester.getRect(_timeline);
  final grid = tester.getRect(
    find.descendant(of: _timeline, matching: find.byWidget(scrollView.child!)),
  );
  expect(viewport.bottom, _phone.height);
  expect(grid.bottom, closeTo(viewport.bottom - _clearance, 0.5));
}

void main() {
  testWidgets('the day timeline scrolls its last hour above the dock', (
    tester,
  ) async {
    await _pumpTimeline(
      tester,
      DayScheduleView(
        selectedDate: _day,
        allDayEvents: const [],
        timedEvents: const [],
        onEventTap: (_) {},
        onCreateAtTime: (_) {},
        onSwipe: (_) {},
      ),
    );
    await _expectLastHourClearsDock(tester);
  });

  for (final days in [1, 3, 7]) {
    testWidgets('the $days-day timeline scrolls its last hour above the dock', (
      tester,
    ) async {
      await _pumpTimeline(
        tester,
        MultiDayScheduleView(
          selectedDate: _day,
          events: const [],
          visibleDayCount: days,
          onEventTap: (_) {},
          onCreateAtTime: (_) {},
          onDaySelected: (_) {},
          onSwipe: (_) {},
        ),
      );
      await _expectLastHourClearsDock(tester);
    });
  }
}
