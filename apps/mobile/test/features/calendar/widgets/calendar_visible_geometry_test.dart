import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/widgets/day_schedule_view.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';

import '../../../helpers/helpers.dart';

final _day = DateTime(2030, 1, 15);

CalendarEvent _event(String id, int start, int end) => CalendarEvent(
  id: id,
  title: id,
  startAt: _day.add(Duration(minutes: start)),
  endAt: _day.add(Duration(minutes: end)),
);

CalendarEvent _allDay(String id, int offset, {int days = 1}) => CalendarEvent(
  id: id,
  title: id,
  startAt: _day.add(Duration(days: offset)),
  endAt: _day.add(Duration(days: offset + days)),
  isAllDayOverride: true,
);

void _setViewport(WidgetTester tester) {
  tester.view.physicalSize = const Size(390, 800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Future<void> _pumpCalendar(
  WidgetTester tester,
  List<CalendarEvent> events, {
  bool multi = true,
  double scale = 1,
  double zoom = 1,
  ValueChanged<CalendarEvent>? onTap,
  bool settle = true,
}) async {
  await tester.pumpApp(
    Builder(
      builder: (context) => MediaQuery(
        data: MediaQuery.of(
          context,
        ).copyWith(textScaler: TextScaler.linear(scale)),
        child: multi
            ? MultiDayScheduleView(
                selectedDate: _day,
                events: events,
                visibleDayCount: 3,
                timelineZoom: zoom,
                onEventTap: onTap ?? (_) {},
                onCreateAtTime: (_) {},
                onDaySelected: (_) {},
                onSwipe: (_) {},
              )
            : DayScheduleView(
                selectedDate: _day,
                allDayEvents: const [],
                timedEvents: events,
                timelineZoom: zoom,
                onEventTap: onTap ?? (_) {},
                onCreateAtTime: (_) {},
                onSwipe: (_) {},
              ),
      ),
    ),
  );
  if (settle) await tester.pumpAndSettle();
}

Rect _card(WidgetTester tester, String title) => tester.getRect(
  find.ancestor(of: find.text(title), matching: find.byType(Positioned)).first,
);

Finder _allDayStack() =>
    find.ancestor(of: find.text('All day'), matching: find.byType(Stack)).first;

double _barHeight(WidgetTester tester) =>
    find.text('All day').evaluate().isEmpty
    ? 0
    : tester.getSize(_allDayStack()).height;

List<ScrollController> _horizontalControllers(WidgetTester tester) => tester
    .widgetList<SingleChildScrollView>(find.byType(SingleChildScrollView))
    .where((view) => view.scrollDirection == Axis.horizontal)
    .map((view) => view.controller!)
    .toList();

class _CountingEvent extends CalendarEvent {
  _CountingEvent(this.onRead)
    : super(
        id: 'counted',
        title: 'counted',
        startAt: _day.add(const Duration(hours: 9)),
        endAt: _day.add(const Duration(hours: 10)),
      );
  final VoidCallback onRead;
  @override
  bool get isAllDay {
    onRead();
    return super.isAllDay;
  }
}

void main() {
  testWidgets('first-frame strip uses selected viewport before attachment', (
    tester,
  ) async {
    _setViewport(tester);
    await _pumpCalendar(tester, [_allDay('initial-visible', 0)], settle: false);
    expect(find.text('initial-visible'), findsOneWidget);
    await tester.pumpAndSettle();
    expect(find.text('initial-visible'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'horizontal pixel scroll does not recompute buffered timed columns',
    (tester) async {
      _setViewport(tester);
      var reads = 0;
      final event = _CountingEvent(() => reads++);
      await _pumpCalendar(tester, [event]);
      final before = reads;
      final horizontal = _horizontalControllers(tester).first;
      horizontal.jumpTo(horizontal.offset + 13);
      await tester.pump();
      expect(reads, before);
      expect(tester.takeException(), isNull);
    },
  );

  for (final leadingEdge in [false, true]) {
    testWidgets('chip inset-only viewport does not reserve rows $leadingEdge', (
      tester,
    ) async {
      _setViewport(tester);
      await _pumpCalendar(tester, [
        for (var i = 0; i < 6; i++) _allDay('edge$i', 0),
      ]);
      final dayWidth = _card(tester, 'edge0').width + 8;
      final allDay = _horizontalControllers(tester)[1];
      final selectedOffset = allDay.offset;
      allDay.jumpTo(
        leadingEdge
            ? selectedOffset - (390 - 52 - 3)
            : selectedOffset + dayWidth - 3,
      );
      await tester.pump();
      expect(find.text('Show more'), findsNothing);
      expect(_barHeight(tester), lessThan(30));
      expect(find.text('edge0'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }

  for (final scale in [1.0, 2.0]) {
    testWidgets('expanded all-day height follows viewport rows $scale', (
      tester,
    ) async {
      _setViewport(tester);
      await _pumpCalendar(tester, [
        for (var i = 0; i < 3; i++) _allDay('visible$i', 0),
        for (var i = 0; i < 6; i++) _allDay('buffer$i', 5),
      ], scale: scale);
      await tester.tap(find.text('Show more'));
      await tester.pumpAndSettle();
      final visibleHeight = _barHeight(tester);
      final controllers = _horizontalControllers(tester);
      final allDay = controllers[1];
      final originalOffset = allDay.offset;
      final dayWidth = _card(tester, 'visible0').width + 8;
      allDay.jumpTo(originalOffset + 5 * dayWidth);
      await tester.pumpAndSettle();
      final denseHeight = _barHeight(tester);
      expect(
        denseHeight,
        greaterThan(visibleHeight + 40),
        reason: 'offscreen rows must not reserve height on the first date',
      );
      // The continuous window may recenter while visiting the dense date.
      // Return by logical date distance, not a stale backing-window offset.
      allDay.jumpTo(allDay.offset - 5 * dayWidth);
      await tester.pumpAndSettle();
      expect(_barHeight(tester), closeTo(visibleHeight, 0.01));
      expect(allDay.offset, closeTo(originalOffset, 0.01));
      expect(controllers.last.offset, closeTo(originalOffset, 0.01));
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('offscreen rows do not expose an expand toggle', (tester) async {
    _setViewport(tester);
    await _pumpCalendar(tester, [
      _allDay('visible', 0),
      for (var i = 0; i < 6; i++) _allDay('buffer$i', 5),
    ]);
    expect(find.text('Show more'), findsNothing);
    expect(_barHeight(tester), lessThan(45));
  });

  testWidgets('partially visible date contributes rows then clears', (
    tester,
  ) async {
    _setViewport(tester);
    await _pumpCalendar(tester, [
      for (var i = 0; i < 3; i++) _allDay('visible$i', 0),
      for (var i = 0; i < 6; i++) _allDay('buffer$i', 5),
    ]);
    await tester.tap(find.text('Show more'));
    await tester.pumpAndSettle();
    final allDay = _horizontalControllers(tester)[1];
    final offset = allDay.offset;
    final dayWidth = _card(tester, 'visible0').width + 8;
    allDay.jumpTo(offset + 2.5 * dayWidth);
    await tester.pump();
    expect(find.text('buffer0'), findsOneWidget);
    final partialHeight = _barHeight(tester);
    allDay.jumpTo(offset + 2 * dayWidth);
    await tester.pump();
    expect(find.text('buffer0'), findsNothing);
    expect(_barHeight(tester), lessThan(30));
    expect(find.text('Show less'), findsNothing);
    expect(partialHeight, greaterThan(100));
    expect(tester.takeException(), isNull);
  });

  testWidgets('first visible span stays stable during scroll and updates', (
    tester,
  ) async {
    _setViewport(tester);
    var events = [_allDay('retained', -3, days: 10)];
    late StateSetter updateEvents;
    await tester.pumpApp(
      StatefulBuilder(
        builder: (context, setState) {
          updateEvents = setState;
          return MultiDayScheduleView(
            selectedDate: _day,
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
    final positioned = find
        .ancestor(of: find.text('retained'), matching: find.byType(Positioned))
        .first;
    final originalElement = tester.element(positioned);
    final originalHeight = _barHeight(tester);
    final allDay = _horizontalControllers(tester)[1];
    final offset = allDay.offset;
    allDay.jumpTo(offset + 23);
    await tester.pump();
    expect(tester.element(positioned), same(originalElement));
    expect(
      tester.getRect(find.text('retained')).left,
      greaterThanOrEqualTo(52),
    );
    expect(tester.getRect(find.text('retained')).right, lessThanOrEqualTo(390));
    updateEvents(() {
      events = [...events, _allDay('offscreen-update', 6)];
    });
    await tester.pump();
    expect(tester.element(positioned), same(originalElement));
    expect(_barHeight(tester), closeTo(originalHeight, 0.01));
    expect(allDay.offset, closeTo(offset + 23, 0.01));
    allDay.jumpTo(offset);
    await tester.pump();
    expect(tester.element(positioned), same(originalElement));
    expect(tester.takeException(), isNull);
  });

  for (final multi in [false, true]) {
    testWidgets('long timed cards retain one-day paint bound $multi', (
      tester,
    ) async {
      _setViewport(tester);
      await _pumpCalendar(tester, [
        CalendarEvent(
          id: 'long',
          title: 'long',
          startAt: _day.add(const Duration(minutes: 540)),
          endAt: _day.add(const Duration(minutes: 3420)),
          isAllDayOverride: false,
        ),
        _event('one-hour', 660, 720),
      ], multi: multi);
      expect(
        _card(tester, 'long').height,
        closeTo(_card(tester, 'one-hour').height * 24, 0.01),
      );
      expect(tester.takeException(), isNull);
    });
    testWidgets('tiny adjacent cards tap distinct event $multi', (
      tester,
    ) async {
      _setViewport(tester);
      final semantics = tester.ensureSemantics();
      try {
        final tapped = <String>[];
        await _pumpCalendar(
          tester,
          [
            _event('tiny-first', 540, 545),
            _event('tiny-next', 545, 550),
            _event('reference', 660, 720),
          ],
          multi: multi,
          scale: 2,
          onTap: (event) => tapped.add(event.id),
        );
        final first = _card(tester, 'tiny-first');
        final next = _card(tester, 'tiny-next');
        expect(first.width, closeTo(_card(tester, 'reference').width, 0.01));
        expect(first.overlaps(next), isFalse);
        await tester.tapAt(first.center);
        await tester.pump();
        await tester.tapAt(next.center);
        await tester.pump();
        expect(tapped, ['tiny-first', 'tiny-next']);
        expect(
          find.bySemanticsLabel('tiny-first, 9:00 AM – 9:05 AM'),
          findsOneWidget,
        );
        expect(
          find.bySemanticsLabel('tiny-next, 9:05 AM – 9:10 AM'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
    });
  }

  for (final multi in [false, true]) {
    for (final zoom in [0.75, 1.0, 1.25]) {
      for (final scale in [1.0, 2.0]) {
        testWidgets('adjacent cards retain full width $multi/$zoom/$scale', (
          tester,
        ) async {
          _setViewport(tester);
          await _pumpCalendar(
            tester,
            [
              _event('first', 540, 570),
              _event('second', 570, 600),
              _event('isolated', 660, 720),
            ],
            multi: multi,
            scale: scale,
            zoom: zoom,
          );
          final first = _card(tester, 'first');
          final second = _card(tester, 'second');
          final isolated = _card(tester, 'isolated');
          expect(first.width, closeTo(isolated.width, 0.01));
          expect(second.width, closeTo(isolated.width, 0.01));
          expect(first.overlaps(second), isFalse);
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
}
