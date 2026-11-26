import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/calendar_recurrence.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/utils/calendar_recurrence_draft.dart';
import 'package:mobile/features/calendar/widgets/event_detail_sheet.dart';
import 'package:mobile/features/calendar/widgets/event_form_sheet.dart';
import 'package:mobile/features/calendar/widgets/event_recurrence_rows.dart';
import 'package:mobile/features/calendar/widgets/recurrence_pattern_sheet.dart';

import '../../../helpers/design_render_harness.dart';

final DateTime _monday = calendarDate(2026, 11, 23, 9);
final _event = CalendarEvent(
  id: 'occurrence',
  title: 'Synthetic standup',
  description: 'Weekly planning',
  startAt: DateTime.utc(2026, 11, 23, 9),
  endAt: DateTime.utc(2026, 11, 23, 9, 30),
  isAllDayOverride: false,
);

Future<void> _open(
  WidgetTester tester,
  Brightness brightness,
  void Function(BuildContext) open,
) async {
  DesignRender.setSize(tester, DesignRender.sizes['phone']!);
  await tester.pumpWidget(
    DesignRenderApp(
      settings: DesignRender.themes[brightness.name]!.$1,
      brightness: brightness,
      child: Builder(
        builder: (context) => Center(
          child: TextButton(
            onPressed: () => open(context),
            child: const Text('Open'),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('Open'));
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  setUpAll(DesignRender.loadFonts);

  for (final brightness in Brightness.values) {
    final theme = brightness.name;
    testWidgets('recurrence pattern sheet renders ($theme)', (tester) async {
      await _open(
        tester,
        brightness,
        (context) => showRecurrencePatternSheet(
          context,
          initial: RecurrencePattern.initial(_monday).copyWith(
            frequency: CalendarRecurrenceFrequency.monthly,
            byWeekday: true,
            endType: CalendarRecurrenceEndType.count,
          ),
          start: _monday,
        ),
      );
      expect(find.byType(RecurrencePatternSheet), findsOneWidget);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(
        tester,
        'calendar-recurrence/pattern-phone-$theme',
      );
    });

    testWidgets('future-scope series form renders ($theme)', (tester) async {
      await _open(
        tester,
        brightness,
        (context) => showEventFormSheet(
          context,
          event: _event,
          timezone: 'UTC',
          isCurrentScope: () => true,
          recurrence: EventRecurrenceOptions(
            timeZone: 'UTC',
            scope: CalendarRecurrenceScope.future,
            pattern: RecurrencePattern.initial(_monday),
            showFutureReset: true,
            onSubmit: (_) async => null,
          ),
        ),
      );
      expect(find.text('Edit recurring event'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(
        tester,
        'calendar-recurrence/form-future-phone-$theme',
      );
    });

    testWidgets('occurrence detail renders ($theme)', (tester) async {
      await _open(
        tester,
        brightness,
        (context) =>
            showEventDetailSheet(context, event: _event, recurrence: 'Weekly'),
      );
      expect(find.text('Weekly'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(
        tester,
        'calendar-recurrence/detail-phone-$theme',
      );
    });
  }
}
