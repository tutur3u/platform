import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';

import '../../../helpers/helpers.dart';

final _day = DateTime.utc(2030, 1, 15);

Finder _horizontal() => find.byWidgetPredicate(
  (widget) =>
      widget is SingleChildScrollView &&
      widget.scrollDirection == Axis.horizontal,
);

Finder _timeline() => find.byWidgetPredicate(
  (widget) =>
      widget is SingleChildScrollView &&
      widget.scrollDirection == Axis.vertical &&
      widget.controller != null,
);

double _gridTop(WidgetTester tester) => tester.getRect(_timeline()).top;

void main() {
  for (final variant in [
    (scale: 1.0, dark: false, width: 390.0, delta: 105.6),
    (scale: 2.0, dark: true, width: 320.0, delta: 163.2),
  ]) {
    for (final reduced in [false, true]) {
      testWidgets('all-day geometry motion $reduced, layout $variant', (
        tester,
      ) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = Size(variant.width, 900);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.view.resetPhysicalSize);
        var motion = reduced;
        var scope = 'initial';
        final tapped = <String>[];
        final anchor = CalendarEvent(
          id: 'anchor',
          title: 'anchor',
          startAt: _day.add(const Duration(hours: 9)),
          endAt: _day.add(const Duration(hours: 10)),
          isAllDayOverride: false,
        );
        var events = [
          anchor,
          for (var row = 0; row < 6; row++) _allDay('row-$row'),
        ];
        late StateSetter update;
        await tester.pumpApp(
          StatefulBuilder(
            builder: (context, setState) {
              update = setState;
              return MediaQuery(
                data: MediaQuery.of(context).copyWith(
                  disableAnimations: motion,
                  textScaler: TextScaler.linear(variant.scale),
                ),
                child: Theme(
                  data: ThemeData(
                    brightness: variant.dark
                        ? Brightness.dark
                        : Brightness.light,
                    textTheme: const TextTheme(
                      labelSmall: TextStyle(fontSize: 12),
                      labelLarge: TextStyle(fontSize: 14),
                    ),
                  ),
                  child: MultiDayScheduleView(
                    zoomScope: scope,
                    selectedDate: _day,
                    events: events,
                    visibleDayCount: 3,
                    onEventTap: (event) => tapped.add(event.id),
                    onCreateAtTime: (_) {},
                    onDaySelected: (_) {},
                    onSwipe: (_) {},
                  ),
                ),
              );
            },
          ),
        );
        await tester.pumpAndSettle();
        final collapsed = _gridTop(tester);
        final header = tester.getRect(_horizontal().first);
        final vertical = tester
            .widget<SingleChildScrollView>(_timeline())
            .controller!;
        final minuteAnchor = vertical.offset;
        final timedAnchor = _card(tester, 'anchor').top - collapsed;
        await tester.tap(find.text('Show more'));
        await tester.pump();
        if (!reduced) expect(_gridTop(tester), closeTo(collapsed, 0.01));
        await tester.pump(const Duration(milliseconds: 60));
        final intermediate = _gridTop(tester);
        expect(intermediate, greaterThan(collapsed));
        _expectContentInsideStrip(tester);
        await tester.tap(find.text('row-0'));
        expect(tapped, ['row-0']);
        await tester.pumpAndSettle();
        final expanded = _gridTop(tester);
        if (!reduced) expect(intermediate, lessThan(expanded));
        expect(expanded - collapsed, closeTo(variant.delta, 0.01));
        expect(tester.getRect(_horizontal().first), header);
        expect(vertical.offset, closeTo(minuteAnchor, 0.01));
        expect(
          _card(tester, 'anchor').top - expanded,
          closeTo(timedAnchor, 0.01),
        );
        for (var row = 0; row < 6; row++) {
          expect(find.text('row-$row'), findsOneWidget);
          expect(
            tester.getRect(find.text('row-$row')).bottom,
            lessThan(expanded),
          );
        }
        await tester.tap(find.text('Show less'));
        await tester.pump();
        if (!reduced) expect(_gridTop(tester), closeTo(expanded, 0.01));
        if (!reduced) {
          await tester.pump(const Duration(milliseconds: 60));
          final shrinking = _gridTop(tester);
          expect(shrinking, inExclusiveRange(collapsed, expanded));
          await tester.tap(find.text('Show more'));
          await tester.pump();
          expect(_gridTop(tester), closeTo(shrinking, 0.01));
          await tester.pumpAndSettle();
          expect(_gridTop(tester), closeTo(expanded, 0.01));
          await tester.tap(find.text('Show less'));
          await tester.pumpAndSettle();
          await tester.tap(find.text('Show more'));
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 60));
          update(() => motion = true);
          await tester.pump();
          expect(_gridTop(tester), closeTo(expanded, 0.01));
          await tester.tap(find.text('Show less'));
        }
        await tester.pumpAndSettle();
        expect(_gridTop(tester), closeTo(collapsed, 0.01));
        update(() {
          scope = 'replacement';
          events = [anchor, _allDay('replacement')];
        });
        await tester.pump();
        final replacementHeight = variant.scale == 1 ? 37.6 : 52.0;
        expect(
          _gridTop(tester),
          closeTo(header.bottom + replacementHeight, 0.01),
        );
        expect(find.text('row-0'), findsNothing);
        expect(find.text('replacement'), findsOneWidget);
        _expectContentInsideStrip(tester);
        update(() => events = [anchor]);
        await tester.pumpAndSettle();
        expect(_gridTop(tester), closeTo(header.bottom + 0.6, 0.01));
        expect(
          _card(tester, 'anchor').top - _gridTop(tester),
          closeTo(timedAnchor, 0.01),
        );
        expect(vertical.offset, closeTo(minuteAnchor, 0.01));
        expect(tester.takeException(), isNull);
      });
    }
  }
  testWidgets(
    'visible all-day rows retarget smoothly through range and data updates',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 900);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      var selected = _day;
      var events = [
        for (var row = 0; row < 6; row++) _allDay('full-$row'),
        for (var row = 0; row < 3; row++) _allDay('short-$row', offset: 5),
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
              onSwipe: (delta) => setState(
                () => selected = selected.add(Duration(days: delta)),
              ),
            );
          },
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Show more'));
      await tester.pumpAndSettle();
      final dense = _gridTop(tester);
      final header = tester.getRect(_horizontal().first);
      final vertical = tester
          .widget<SingleChildScrollView>(_timeline())
          .controller!;
      final minuteAnchor = vertical.offset;
      final allDay = tester
          .widgetList<SingleChildScrollView>(_horizontal())
          .toList()[1]
          .controller!;
      allDay.jumpTo(allDay.offset + 5 * 338 / 3);
      await tester.pump();
      expect(_gridTop(tester), closeTo(dense, 0.01));
      await tester.pumpAndSettle();
      final sparse = _gridTop(tester);
      expect(dense - sparse, closeTo(78, 0.01));
      expect(find.text('short-2'), findsOneWidget);
      allDay.jumpTo(allDay.offset - 5 * 338 / 3);
      await tester.pump();
      expect(_gridTop(tester), closeTo(sparse, 0.01));
      await tester.pump(const Duration(milliseconds: 60));
      final growing = _gridTop(tester);
      expect(growing, inExclusiveRange(sparse, dense));
      allDay.jumpTo(allDay.offset + 5 * 338 / 3);
      await tester.pump();
      expect(_gridTop(tester), closeTo(growing, 0.01));
      await tester.pump(const Duration(milliseconds: 60));
      final shrinking = _gridTop(tester);
      expect(shrinking, inExclusiveRange(sparse, growing));
      allDay.jumpTo(allDay.offset - 5 * 338 / 3);
      await tester.pump();
      expect(_gridTop(tester), closeTo(shrinking, 0.01));
      final fullElement = tester.element(find.text('full-0'));
      update(() => events = [...events, _allDay('offscreen-data', offset: -6)]);
      await tester.pump();
      expect(_gridTop(tester), closeTo(shrinking, 0.01));
      expect(selected, _day);
      await tester.pumpAndSettle();
      expect(_gridTop(tester), closeTo(dense, 0.01));
      expect(tester.element(find.text('full-0')), same(fullElement));
      expect(tester.getRect(_horizontal().first), header);
      expect(vertical.offset, closeTo(minuteAnchor, 0.01));
      for (final view in tester.widgetList<SingleChildScrollView>(
        _horizontal(),
      )) {
        expect(view.controller!.offset, closeTo(allDay.offset, 0.01));
      }
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'retained all-day material follows height through row insertion reversal',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 900);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      final retained = _allDay('retained-row');
      var events = [retained];
      final tapped = <String>[];
      late StateSetter update;
      await tester.pumpApp(
        StatefulBuilder(
          builder: (context, setState) {
            update = setState;
            return MultiDayScheduleView(
              selectedDate: _day,
              events: events,
              visibleDayCount: 3,
              onEventTap: (event) => tapped.add(event.id),
              onCreateAtTime: (_) {},
              onDaySelected: (_) {},
              onSwipe: (_) {},
            );
          },
        ),
      );
      await tester.pumpAndSettle();
      final material = find
          .ancestor(
            of: find.text('retained-row'),
            matching: find.byType(Material),
          )
          .first;
      final element = tester.element(material);
      final before = _card(tester, 'retained-row');
      final initialGrid = _gridTop(tester);
      update(
        () => events = [
          CalendarEvent(
            id: 'prefix',
            title: 'prefix',
            startAt: _day.subtract(const Duration(days: 1)),
            endAt: _day.add(const Duration(days: 1)),
            isAllDayOverride: true,
          ),
          retained,
        ],
      );
      await tester.pump();
      expect(tester.element(material), same(element));
      expect(_card(tester, 'retained-row'), before);
      expect(find.text('prefix'), findsNothing);
      await tester.pump(const Duration(milliseconds: 60));
      final moving = _card(tester, 'retained-row');
      final movingGrid = _gridTop(tester);
      expect(moving.top - before.top, inExclusiveRange(0, 26));
      expect(movingGrid - initialGrid, closeTo(moving.top - before.top, 0.01));
      expect(moving.bottom, lessThan(movingGrid));
      expect(find.text('prefix'), findsNothing);
      await tester.tap(find.text('retained-row'));
      expect(tapped, ['retained-row']);
      update(() => events = [retained]);
      await tester.pump();
      expect(_card(tester, 'retained-row'), moving);
      expect(tester.element(material), same(element));
      await tester.pump(const Duration(milliseconds: 60));
      final returning = _card(tester, 'retained-row');
      expect(returning.top, inExclusiveRange(before.top, moving.top));
      expect(returning.bottom, lessThan(_gridTop(tester)));
      await tester.pumpAndSettle();
      expect(_card(tester, 'retained-row'), before);
      expect(_gridTop(tester), closeTo(initialGrid, 0.01));
      expect(tester.element(material), same(element));
      expect(tester.takeException(), isNull);
    },
  );
}

CalendarEvent _allDay(String title, {int offset = 0}) => CalendarEvent(
  id: title,
  title: title,
  startAt: _day.add(Duration(days: offset)),
  endAt: _day.add(Duration(days: offset + 1)),
  isAllDayOverride: true,
);

Rect _card(WidgetTester tester, String title) => tester.getRect(
  find.ancestor(of: find.text(title), matching: find.byType(Positioned)).first,
);

void _expectContentInsideStrip(WidgetTester tester) {
  final top = tester.getRect(_horizontal().first).bottom;
  final bottom = _gridTop(tester);
  for (final element in find.byType(Text).evaluate()) {
    final text = (element.widget as Text).data;
    if (text == null || (!text.startsWith('row-') && text != 'replacement')) {
      continue;
    }
    final rect = tester.getRect(find.byWidget(element.widget));
    expect(rect.top, greaterThanOrEqualTo(top));
    expect(rect.bottom, lessThanOrEqualTo(bottom));
    expect(rect.left, greaterThanOrEqualTo(52));
    expect(rect.right, lessThanOrEqualTo(tester.view.physicalSize.width));
  }
}
