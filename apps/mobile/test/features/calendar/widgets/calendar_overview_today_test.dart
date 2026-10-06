import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/widgets/month_view.dart';
import 'package:mobile/features/calendar/widgets/year_view.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import '../../../helpers/helpers.dart';

void main() {
  for (final yearView in [false, true]) {
    testWidgets('only today receives date fill in '
        '${yearView ? 'year' : 'month'} overview', (tester) async {
      DateTime? selected;
      await tester.pumpApp(
        CalendarWallClock(
          now: DateTime.utc(2030, 1, 16, 12),
          child: yearView
              ? YearView(
                  selectedDate: DateTime.utc(2030, 1, 15),
                  focusedMonth: DateTime.utc(2030),
                  events: const [],
                  firstDayOfWeek: 0,
                  onDaySelected: (date) => selected = date,
                  onYearChanged: (_) {},
                )
              : MonthView(
                  selectedDate: DateTime.utc(2030, 1, 15),
                  focusedMonth: DateTime.utc(2030),
                  events: const [],
                  onDaySelected: (date) => selected = date,
                ),
        ),
      );
      await tester.pumpAndSettle();
      final old = find.text('15').first;
      final today = find.text('16').first;
      BoxDecoration decoration(Finder text) => tester
          .widgetList<Container>(
            find.ancestor(of: text, matching: find.byType(Container)),
          )
          .map((w) => w.decoration)
          .whereType<BoxDecoration>()
          .first;
      final primary = yearView
          ? shad.Theme.of(tester.element(old)).colorScheme.primary
          : Theme.of(tester.element(old)).colorScheme.primary;
      expect(decoration(old).color, Colors.transparent);
      expect(decoration(today).color, primary);
      await tester.tap(old);
      expect(selected, DateTime.utc(2030, 1, 15));
      expect(tester.takeException(), isNull);
    });
  }
}
