import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';

import '../../../helpers/helpers.dart';

final _day = DateTime.utc(2030, 1, 15);

CalendarEvent _event(int start, int end, {String title = 'Viewport label'}) =>
    CalendarEvent(
      id: 'stable-event',
      wsId: 'synthetic-workspace',
      title: title,
      startAt: _day.add(Duration(days: start)),
      endAt: _day.add(Duration(days: end)),
      isAllDayOverride: true,
    );

Finder _horizontal() => find.byWidgetPredicate(
  (widget) =>
      widget is SingleChildScrollView &&
      widget.scrollDirection == Axis.horizontal,
);

Finder _material(String title) =>
    find.ancestor(of: find.text(title), matching: find.byType(Material)).first;

void _expectVisible(WidgetTester tester, String title) {
  expect(find.text(title), findsOneWidget);
  final label = tester.getRect(find.text(title));
  expect(label.left, greaterThanOrEqualTo(52));
  expect(label.right, lessThanOrEqualTo(390));
  expect(label.width, greaterThan(0));
  expect(tester.takeException(), isNull);
}

void main() {
  for (final reduced in [false, true]) {
    testWidgets('late all-day first-column geometry, reduced motion $reduced', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 900);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      var events = <CalendarEvent>[];
      late StateSetter update;
      await tester.pumpApp(
        StatefulBuilder(
          builder: (context, setState) {
            update = setState;
            return MediaQuery(
              data: MediaQuery.of(context).copyWith(disableAnimations: reduced),
              child: MultiDayScheduleView(
                selectedDate: _day,
                events: events,
                visibleDayCount: 3,
                onEventTap: (_) {},
                onCreateAtTime: (_) {},
                onDaySelected: (_) {},
                onSwipe: (_) {},
              ),
            );
          },
        ),
      );
      await tester.pumpAndSettle();
      final grid = tester
          .widgetList<SingleChildScrollView>(_horizontal())
          .last
          .controller!;
      grid.jumpTo(grid.offset + 135);
      await tester.pump();
      update(() => events = [_event(-2, 6)]);
      await tester.pump();
      var renderedFrames = 0;
      for (var frame = 0; frame <= 6; frame++) {
        if (find.text('Viewport label').evaluate().isNotEmpty) {
          renderedFrames++;
          _expectVisible(tester, 'Viewport label');
          expect(
            tester.getRect(find.text('Viewport label')).left,
            closeTo(63, 0.01),
          );
        }
        await tester.pump(const Duration(milliseconds: 30));
      }
      expect(renderedFrames, greaterThan(0));
    });
  }

  testWidgets('date and title edits preserve the first visible pill material', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 900);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    var event = _event(-2, 6);
    var selected = _day;
    var days = 3;
    late StateSetter update;
    final tapped = <CalendarEvent>[];
    await tester.pumpApp(
      StatefulBuilder(
        builder: (context, setState) {
          update = setState;
          return MultiDayScheduleView(
            selectedDate: selected,
            events: [event],
            visibleDayCount: days,
            onEventTap: tapped.add,
            onCreateAtTime: (_) {},
            onDaySelected: (_) {},
            onSwipe: (_) {},
          );
        },
      ),
    );
    await tester.pumpAndSettle();
    final material = tester.element(_material('Viewport label'));
    final horizontal = tester
        .widgetList<SingleChildScrollView>(_horizontal())
        .toList()[1]
        .controller!;
    for (final delta in [17.0, 94.0, -41.0]) {
      horizontal.jumpTo(horizontal.offset + delta);
      await tester.pump();
      _expectVisible(tester, 'Viewport label');
      expect(tester.element(_material('Viewport label')), same(material));
    }
    for (final range in [(-1, 5), (-3, 4), (0, 6)]) {
      update(() => event = _event(range.$1, range.$2, title: 'Updated label'));
      await tester.pump();
      _expectVisible(tester, 'Updated label');
      expect(find.text('Viewport label'), findsNothing);
      expect(tester.element(_material('Updated label')), same(material));
      await tester.pumpAndSettle();
      expect(tester.element(_material('Updated label')), same(material));
      await tester.tap(find.text('Updated label'));
      expect(tapped.last.startAt, event.startAt);
      expect(tapped.last.endAt, event.endAt);
    }
    update(() {
      selected = _day.add(const Duration(days: 1));
      days = 2;
    });
    await tester.pump();
    await tester.pump();
    _expectVisible(tester, 'Updated label');
    expect(tester.element(_material('Updated label')), same(material));
    await tester.pumpAndSettle();
    _expectVisible(tester, 'Updated label');
  });

  testWidgets('merged pill survives its first constituent leaving the window', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 900);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    var selected = _day;
    final events = [
      for (var offset = -7; offset < 10; offset++)
        _event(
          offset,
          offset + 1,
          title: 'Merged label',
        ).copyWith(id: 'constituent-$offset'),
    ];
    late StateSetter update;
    await tester.pumpApp(
      StatefulBuilder(
        builder: (context, setState) {
          update = setState;
          return MultiDayScheduleView(
            selectedDate: selected,
            events: events,
            visibleDayCount: 3,
            onEventTap: (_) {},
            onCreateAtTime: (_) {},
            onDaySelected: (_) {},
            onSwipe: (_) {},
          );
        },
      ),
    );
    await tester.pumpAndSettle();
    final material = tester.element(_material('Merged label'));
    for (var shift = 1; shift <= 3; shift++) {
      update(() => selected = _day.add(Duration(days: shift)));
      await tester.pump();
      expect(tester.element(_material('Merged label')), same(material));
      await tester.pump();
      _expectVisible(tester, 'Merged label');
      await tester.pumpAndSettle();
      expect(tester.element(_material('Merged label')), same(material));
    }
  });
}
