import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_recurrence.dart';
import 'package:mobile/features/calendar/cubit/calendar_series_cubit.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/utils/calendar_recurrence_draft.dart';
import 'package:mobile/features/calendar/widgets/event_form_sheet.dart';
import 'package:mobile/features/calendar/widgets/event_recurrence_rows.dart';
import 'package:mobile/features/calendar/widgets/recurrence_pattern_sheet.dart';

import '../../../helpers/helpers.dart';

void _pinPhone(WidgetTester tester) {
  tester.view
    ..physicalSize = const Size(390, 844)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 250));
  }
}

void main() {
  // Monday 23 November 2026, 09:00.
  final monday = calendarDate(2026, 11, 23, 9);

  testWidgets('creates a weekly series and keeps the draft on conflict', (
    tester,
  ) async {
    _pinPhone(tester);
    final submitted = <Map<String, dynamic>>[];
    final answers = <CalendarSeriesFailure?>[
      CalendarSeriesFailure.conflict,
      null,
    ];
    Map<String, dynamic>? popped;
    await tester.pumpApp(
      Builder(
        builder: (context) => Material(
          child: TextButton(
            onPressed: () async {
              popped = await showEventFormSheet(
                context,
                initialStartTime: monday,
                timezone: 'UTC',
                isCurrentScope: () => true,
                recurrence: EventRecurrenceOptions(
                  timeZone: 'UTC',
                  onSubmit: (result) async {
                    submitted.add(result);
                    return answers.removeAt(0);
                  },
                ),
              );
            },
            child: const Text('Open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await _settle(tester);
    await tester.enterText(find.byType(TextField).first, 'Synthetic standup');
    await tester.pump();
    await tester.ensureVisible(find.text('Does not repeat'));
    await tester.pump();
    await tester.tap(find.text('Does not repeat'));
    await _settle(tester);
    expect(find.byType(RecurrencePatternSheet), findsOneWidget);
    await tester.tap(find.text('Done'));
    await _settle(tester);
    expect(find.text('Weekly'), findsOneWidget);
    expect(find.text('UTC'), findsOneWidget);

    await tester.tap(find.text('Save'));
    await _settle(tester);
    final rule = submitted.single['rule'] as CalendarRecurrenceRule;
    expect(rule.toJson(), {
      'version': 1,
      'frequency': 'weekly',
      'interval': 1,
      'timeZone': 'UTC',
      'weekdays': ['MO'],
      'end': {'type': 'never'},
    });
    expect((submitted.single['anchor'] as CalendarRecurrenceAnchor).toJson(), {
      'startLocal': '2026-11-23T09:00:00',
      'endLocal': '2026-11-23T10:00:00',
      'allDay': false,
    });
    expect(
      find.text('This series changed elsewhere. Reload it before saving.'),
      findsOneWidget,
    );
    expect(find.text('Reload series'), findsOneWidget);
    expect(find.text('Synthetic standup'), findsOneWidget);

    await tester.tap(find.text('Save'));
    await _settle(tester);
    expect(submitted, hasLength(2));
    expect(popped, {'series': true});
  });

  testWidgets('a non-repeating create returns an ordinary event', (
    tester,
  ) async {
    _pinPhone(tester);
    var submitted = false;
    Map<String, dynamic>? popped;
    await tester.pumpApp(
      Builder(
        builder: (context) => Material(
          child: TextButton(
            onPressed: () async {
              popped = await showEventFormSheet(
                context,
                initialStartTime: monday,
                timezone: 'UTC',
                isCurrentScope: () => true,
                recurrence: EventRecurrenceOptions(
                  timeZone: 'UTC',
                  onSubmit: (_) async {
                    submitted = true;
                    return null;
                  },
                ),
              );
            },
            child: const Text('Open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await _settle(tester);
    await tester.enterText(find.byType(TextField).first, 'One-off');
    await tester.pump();
    await tester.tap(find.text('Save'));
    await _settle(tester);
    expect(submitted, isFalse);
    expect(popped?['title'], 'One-off');
    expect(popped?.containsKey('series'), isFalse);
  });

  testWidgets('the pattern sheet offers monthly options and validates', (
    tester,
  ) async {
    _pinPhone(tester);
    ({RecurrencePattern? pattern})? picked;
    await tester.pumpApp(
      Builder(
        builder: (context) => Material(
          child: TextButton(
            onPressed: () async {
              picked = await showRecurrencePatternSheet(
                context,
                initial: RecurrencePattern.initial(
                  monday,
                ).copyWith(frequency: CalendarRecurrenceFrequency.monthly),
                start: monday,
              );
            },
            child: const Text('Open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await _settle(tester);
    expect(find.text('Repeat by'), findsOneWidget);
    expect(find.text('When the day is missing'), findsOneWidget);
    await tester.enterText(find.byType(TextField).at(1), '24');
    await tester.pump();
    await tester.tap(find.text('Done'));
    await _settle(tester);
    expect(
      find.text('Check the title, dates, time zone and recurrence settings.'),
      findsOneWidget,
    );
    await tester.enterText(find.byType(TextField).at(1), '23');
    await tester.pump();
    await tester.tap(find.text('Done'));
    await _settle(tester);
    expect(picked?.pattern?.toRule('UTC').monthDay, 23);
  });
}
