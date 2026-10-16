import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';

import '../../../helpers/helpers.dart';

final _day = DateTime.utc(2030, 1, 15);

List<SingleChildScrollView> _horizontal(WidgetTester tester) => tester
    .widgetList<SingleChildScrollView>(
      find.byWidgetPredicate(
        (widget) =>
            widget is SingleChildScrollView &&
            widget.scrollDirection == Axis.horizontal,
      ),
    )
    .toList();

Rect _eventRect(WidgetTester tester, String title) => tester.getRect(
  find.ancestor(of: find.text(title), matching: find.byType(Positioned)).first,
);

void main() {
  for (final drag in [false, true]) {
    testWidgets(
      'three-day painted dates stay stable in both directions, drag $drag',
      (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = const Size(390, 800);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.view.resetPhysicalSize);
        var selected = _day;
        var events = [
          for (var offset = -7; offset <= 14; offset++)
            CalendarEvent(
              id: 'timed-$offset',
              title: 'timed-$offset',
              startAt: _day.add(Duration(days: offset, hours: 9)),
              endAt: _day.add(Duration(days: offset, hours: 10)),
              isAllDayOverride: false,
            ),
          CalendarEvent(
            id: 'retained-span',
            title: 'retained-span',
            startAt: _day.subtract(const Duration(days: 7)),
            endAt: _day.add(const Duration(days: 15)),
            isAllDayOverride: true,
          ),
        ];
        late StateSetter updateEvents;
        await tester.pumpApp(
          StatefulBuilder(
            builder: (context, update) {
              updateEvents = update;
              return MultiDayScheduleView(
                selectedDate: selected,
                events: events,
                visibleDayCount: 3,
                onEventTap: (_) {},
                onCreateAtTime: (_) {},
                onDaySelected: (_) {},
                onSwipe: (delta) => update(
                  () => selected = selected.add(Duration(days: delta)),
                ),
              );
            },
          ),
        );
        await tester.pumpAndSettle();
        const width = 338 / 3;
        final top = _eventRect(tester, 'timed-0').top;
        final element = tester.element(find.text('timed-5'));
        final header = tester.element(find.text('20'));
        final span = tester.element(find.text('retained-span'));
        final controller = _horizontal(tester).last.controller!;
        final painted = await _move(
          tester,
          controller,
          width,
          delta: 5,
          drag: drag,
          title: 'timed-5',
          arrived: () => selected == _day.add(const Duration(days: 5)),
        );
        expect(selected, _day.add(const Duration(days: 5)));
        expect(painted.left, closeTo(52.6, 0.01));
        expect(tester.element(find.text('timed-5')), same(element));
        expect(tester.element(find.text('20')), same(header));
        expect(tester.element(find.text('retained-span')), same(span));
        expect(_eventRect(tester, 'timed-5').left, closeTo(52.6, 0.01));
        expect(_eventRect(tester, 'timed-5').top, closeTo(top, 0.01));
        expect(find.text('retained-span'), findsOneWidget);
        final first = _eventRect(tester, 'timed-5');
        await tester.pump();
        expect(_eventRect(tester, 'timed-5'), first);
        for (final view in _horizontal(tester)) {
          expect(view.controller!.offset, closeTo(controller.offset, 0.01));
        }
        final reverse = await _move(
          tester,
          controller,
          width,
          delta: -5,
          drag: drag,
          title: 'timed-0',
          arrived: () => selected == _day,
        );
        expect(selected, _day);
        expect(reverse.left, closeTo(52.6, 0.01));
        expect(_eventRect(tester, 'timed-0').left, closeTo(52.6, 0.01));
        expect(_eventRect(tester, 'timed-0').top, closeTo(top, 0.01));
        expect(find.text('retained-span'), findsOneWidget);
        final beforeRefresh = _eventRect(tester, 'timed-0');
        updateEvents(() => events = [...events]);
        await tester.pump();
        expect(_eventRect(tester, 'timed-0'), beforeRefresh);
        expect(tester.element(find.text('retained-span')), same(span));
        expect(
          tester.getRect(find.text('retained-span')).left,
          greaterThanOrEqualTo(52),
        );
        expect(
          tester.getRect(find.text('retained-span')).right,
          lessThanOrEqualTo(390),
        );
        expect(tester.takeException(), isNull);
      },
    );
  }
}

Future<Rect> _move(
  WidgetTester tester,
  ScrollController controller,
  double width, {
  required int delta,
  required bool drag,
  required String title,
  required bool Function() arrived,
}) async {
  Rect? painted;
  var observing = true;
  void sample(Duration _) {
    if (!observing) return;
    if (arrived()) {
      painted = _eventRect(tester, title);
    } else {
      WidgetsBinding.instance.addPostFrameCallback(sample);
    }
  }

  WidgetsBinding.instance.addPostFrameCallback(sample);
  try {
    if (drag) {
      final gesture = await tester.startGesture(
        tester.getCenter(
          find.byWidgetPredicate(
            (widget) =>
                widget is SingleChildScrollView &&
                widget.controller == controller,
          ),
        ),
      );
      await gesture.moveBy(Offset(delta > 0 ? -20 : 20, 0));
      await tester.pump();
      await gesture.moveBy(Offset(-delta * width, 0));
      await tester.pump(const Duration(milliseconds: 200));
      await gesture.up();
      for (var frame = 0; frame < 90 && painted == null; frame++) {
        await tester.pump(const Duration(milliseconds: 16));
      }
    } else {
      controller.jumpTo(controller.offset + delta * width);
      await tester.pump();
    }
    expect(painted, isNotNull, reason: 'the selected range must settle');
    return painted!;
  } finally {
    observing = false;
  }
}
