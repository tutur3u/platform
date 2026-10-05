import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';

import '../../../helpers/helpers.dart';

void main() {
  testWidgets(
    'horizontal drag retains fractional days and advances continuously',
    (tester) async {
      var selected = DateTime.utc(2030, 1, 10);
      final changes = <int>[];
      var events = <CalendarEvent>[];
      late StateSetter updateView;
      await tester.pumpApp(
        StatefulBuilder(
          builder: (context, update) {
            updateView = update;
            return MultiDayScheduleView(
              selectedDate: selected,
              events: events,
              visibleDayCount: 3,
              onEventTap: (_) {},
              onCreateAtTime: (_) {},
              onDaySelected: (_) {},
              onSwipe: (delta) {
                changes.add(delta);
                update(() => selected = selected.add(Duration(days: delta)));
              },
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
      final grid = horizontal.last;
      final before = tester
          .widget<SingleChildScrollView>(grid)
          .controller!
          .offset;
      final gesture = await tester.startGesture(tester.getCenter(grid));
      await gesture.moveBy(const Offset(-20, 0));
      await tester.pump();
      await gesture.moveBy(const Offset(-70, 0));
      await tester.pump();
      final during = tester
          .widget<SingleChildScrollView>(grid)
          .controller!
          .offset;
      expect(during, greaterThan(before));
      expect(changes, isEmpty); // No velocity-triggered whole-set replacement.
      await gesture.up();
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      // Header and timeline stay synchronized after selected-date rebuilding.
      final views = tester
          .widgetList<SingleChildScrollView>(horizontal)
          .toList();
      expect(
        views.first.controller!.offset,
        closeTo(views.last.controller!.offset, 1),
      );
      await tester.drag(grid, const Offset(-550, 0));
      await tester.pumpAndSettle();
      expect(changes, isNotEmpty);
      expect(changes.any((delta) => delta.abs() != 3), isTrue);
      final extent = tester
          .widget<SingleChildScrollView>(grid)
          .controller!
          .position
          .maxScrollExtent;
      for (var visit = 0; visit < 12; visit++) {
        await tester.drag(grid, const Offset(-550, 0));
        await tester.pumpAndSettle();
      }
      expect(selected.isAfter(DateTime.utc(2030, 2)), isTrue);
      expect(
        tester
            .widget<SingleChildScrollView>(grid)
            .controller!
            .position
            .maxScrollExtent,
        closeTo(extent, 1),
      );
      updateView(() {
        events = [
          CalendarEvent(
            id: 'all-day',
            title: 'Offline all-day event',
            startAt: selected,
            endAt: selected.add(const Duration(days: 1)),
          ),
        ];
      });
      await tester.pumpAndSettle();
      final refreshed = tester
          .widgetList<SingleChildScrollView>(horizontal)
          .toList();
      expect(refreshed, hasLength(3));
      for (final view in refreshed) {
        expect(
          view.controller!.offset,
          closeTo(refreshed.last.controller!.offset, 1),
        );
      }
      expect(tester.takeException(), isNull);
    },
  );
}
