import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/widgets/agenda_view.dart';

import '../../../helpers/helpers.dart';

void main() {
  for (final size in [
    const Size(390, 844),
    const Size(844, 390),
    const Size(768, 1024),
    const Size(1376, 1032),
  ]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('agenda readable and clears dock at $size / $scale', (
        tester,
      ) async {
        tester.view
          ..devicePixelRatio = 1
          ..physicalSize = size;
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });
        final date = DateTime(2030, 1, 1, 9);
        final events = List.generate(
          12,
          (i) => CalendarEvent(
            id: '$i',
            title: 'Planning meeting $i',
            description: 'A detailed discussion with the team',
            startAt: date.add(Duration(hours: i)),
            endAt: date.add(Duration(hours: i + 1)),
          ),
        );
        CalendarEvent? tapped;
        await tester.pumpApp(
          Builder(
            builder: (context) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                padding: const EdgeInsets.only(bottom: 100),
                alwaysUse24HourFormat: true,
                textScaler: TextScaler.linear(scale),
              ),
              child: AgendaView(
                selectedDate: date,
                events: events,
                onEventTap: (event) => tapped = event,
                onDaySelected: (_) {},
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.text('09:00 – 10:00'), findsOneWidget);
        await tester.tap(find.text('Planning meeting 0'));
        expect(tapped?.id, '0');
        await tester.scrollUntilVisible(find.text('Planning meeting 11'), 500);
        await tester.drag(find.byType(ListView), const Offset(0, -1000));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(
          tester.getBottomLeft(find.text('Planning meeting 11')).dy,
          lessThan(size.height - 100),
        );
      });
    }
  }
}
