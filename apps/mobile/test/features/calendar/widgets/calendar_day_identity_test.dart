import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/widgets/multi_day_schedule_view.dart';
import '../../../helpers/helpers.dart';

final day = DateTime.utc(2030, 1, 15);
CalendarEvent allDay(String id, String title, int start, int end) =>
    CalendarEvent(
      id: id,
      title: title,
      wsId: 'synthetic-workspace',
      startAt: day.add(Duration(days: start)),
      endAt: day.add(Duration(days: end)),
      isAllDayOverride: true,
    );
Widget view(List<CalendarEvent> events, {Object? scope = 'actor-one'}) =>
    CalendarWallClock(
      now: day.add(const Duration(days: 1, hours: 12)),
      child: MultiDayScheduleView(
        zoomScope: scope,
        selectedDate: day,
        events: events,
        onEventTap: (_) {},
        onCreateAtTime: (_) {},
        onDaySelected: (_) {},
        onSwipe: (_) {},
        visibleDayCount: 3,
      ),
    );
void main() {
  testWidgets('today alone highlights, selected viewport day stays neutral', (
    tester,
  ) async {
    await tester.pumpApp(view([]));
    await tester.pumpAndSettle();
    final primary = Theme.of(
      tester.element(find.text('15').first),
    ).colorScheme.primary;
    final selected = find.ancestor(
      of: find.text('15').first,
      matching: find.byType(AnimatedContainer),
    );
    final today = find.ancestor(
      of: find.text('16').first,
      matching: find.byType(AnimatedContainer),
    );
    expect(
      (tester.widget<AnimatedContainer>(selected).decoration! as BoxDecoration)
          .color,
      isNot(primary),
    );
    expect(
      (tester.widget<AnimatedContainer>(today).decoration! as BoxDecoration)
          .color,
      primary,
    );
  });
  testWidgets('all-day material survives earlier row insertion', (
    tester,
  ) async {
    var events = [allDay('retained', 'Retained synthetic span', 0, 3)];
    late StateSetter rebuild;
    await tester.pumpApp(
      StatefulBuilder(
        builder: (context, setState) {
          rebuild = setState;
          return view(events);
        },
      ),
    );
    await tester.pumpAndSettle();
    final material = find
        .ancestor(
          of: find.text('Retained synthetic span'),
          matching: find.byType(Material),
        )
        .first;
    final before = tester.element(material);
    rebuild(() {
      events = [allDay('earlier', 'Earlier synthetic span', -1, 3), ...events];
    });
    await tester.pump();
    expect(tester.element(material), same(before));
    expect(tester.takeException(), isNull);
  });
  testWidgets('duplicate provider IDs retain distinct occurrence material', (
    tester,
  ) async {
    var events = [
      allDay('series', 'First synthetic occurrence', 0, 1),
      allDay('series', 'Retained synthetic occurrence', 1, 3),
    ];
    late StateSetter rebuild;
    await tester.pumpApp(
      StatefulBuilder(
        builder: (context, setState) {
          rebuild = setState;
          return view(events);
        },
      ),
    );
    await tester.pumpAndSettle();
    final material = find
        .ancestor(
          of: find.text('Retained synthetic occurrence'),
          matching: find.byType(Material),
        )
        .first;
    final before = tester.element(material);
    rebuild(() {
      events = [events.last];
    });
    await tester.pump();
    expect(tester.element(material), same(before));
    expect(tester.takeException(), isNull);
  });
  testWidgets('scope transition remounts prior actor material', (tester) async {
    var scope = 'actor-one';
    late StateSetter rebuild;
    final events = [allDay('same-event', 'Scoped synthetic span', 0, 3)];
    await tester.pumpApp(
      StatefulBuilder(
        builder: (context, setState) {
          rebuild = setState;
          return view(events, scope: scope);
        },
      ),
    );
    await tester.pumpAndSettle();
    final material = find
        .ancestor(
          of: find.text('Scoped synthetic span'),
          matching: find.byType(Material),
        )
        .first;
    final before = tester.element(material);
    rebuild(() {
      scope = 'actor-two';
    });
    await tester.pump();
    expect(tester.element(material), isNot(same(before)));
    expect(tester.takeException(), isNull);
  });
}
