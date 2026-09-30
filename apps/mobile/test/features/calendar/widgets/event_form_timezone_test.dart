import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/widgets/event_form_sheet.dart';

import '../../../helpers/helpers.dart';

void main() {
  for (final sample in [
    ('2026-09-30T07:30:00Z', '2026-09-30T08:30:00Z', 'Asia/Ho_Chi_Minh'),
    ('2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z', 'America/New_York'),
    ('2026-11-01T06:30:00Z', '2026-11-01T07:30:00Z', 'America/New_York'),
    (
      '2026-11-01T06:30:45.123456Z',
      '2026-11-01T07:30:45.654321Z',
      'America/New_York',
    ),
  ]) {
    testWidgets('title-only edit preserves ${sample.$1} in ${sample.$3}', (
      tester,
    ) async {
      Map<String, dynamic>? saved;
      final event = CalendarEvent.fromJson({
        'id': 'event',
        'title': 'Meeting',
        'start_at': sample.$1,
        'end_at': sample.$2,
      });
      await tester.pumpApp(
        Builder(
          builder: (context) => Material(
            child: TextButton(
              onPressed: () async {
                saved = await showEventFormSheet(
                  context,
                  event: event,
                  timezone: sample.$3,
                );
              },
              child: const Text('Open editor'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open editor'));
      await tester.pumpAndSettle();
      if (sample.$1.contains('03-08')) {
        expect(find.text('Mar 8, 2026'), findsNWidgets(2));
        expect(find.text('Mar 9, 2026'), findsNothing);
      }
      await tester.enterText(find.byType(TextField).first, 'Renamed meeting');
      tester.testTextInput.hide();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(saved?['title'], 'Renamed meeting');
      expect(saved?['startAt'], DateTime.parse(sample.$1));
      expect(saved?['endAt'], DateTime.parse(sample.$2));
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('nonexistent New York time remains in editor with validation', (
    tester,
  ) async {
    Map<String, dynamic>? saved;
    await tester.pumpApp(
      Builder(
        builder: (context) => Material(
          child: TextButton(
            onPressed: () async {
              saved = await showEventFormSheet(
                context,
                initialStartTime: calendarDate(2026, 3, 8, 2, 30),
                timezone: 'America/New_York',
              );
            },
            child: const Text('Open editor'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open editor'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'DST meeting');
    tester.testTextInput.hide();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(saved, isNull);
    expect(find.textContaining('Some times do not exist'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
