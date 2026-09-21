import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/widgets/week_view.dart';

import '../../../helpers/helpers.dart';

void main() {
  for (final scale in [1.0, 2.0]) {
    testWidgets('short weekly events fit at text scale $scale', (tester) async {
      final day = DateTime(2030);
      await tester.pumpApp(
        Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(scale)),
            child: WeekView(
              selectedDate: day,
              events: [
                for (var hour = 0; hour < 24; hour++)
                  CalendarEvent(
                    id: '$hour',
                    title: 'A long meeting title with several words',
                    startAt: day.add(Duration(hours: hour)),
                    endAt: day.add(
                      Duration(hours: hour, minutes: hour.isEven ? 5 : 30),
                    ),
                  ),
              ],
              onEventTap: (_) {},
              onCreateAtTime: (_) {},
              onDaySelected: (_) {},
              onSwipe: (_) {},
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }
}
