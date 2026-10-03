import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/google_calendar_color.dart';
import 'package:mobile/features/calendar/widgets/event_form_sheet.dart';
import 'package:mobile/features/calendar/widgets/google_calendar_color_picker.dart';

import '../../../helpers/helpers.dart';

const _connection = '00000000-0000-4000-8000-000000000001';
GoogleCalendarColorOptions _options({bool enabled = true}) =>
    GoogleCalendarColorOptions.fromJson({
      'provider': 'google',
      'connectionId': _connection,
      'providerColorWrites': enabled,
      'options': [
        {'kind': 'inherit', 'background': '#123456'},
        {'kind': 'event', 'id': '11', 'background': '#abcdef'},
        {
          'kind': 'label',
          'id': 'label-one',
          'name': 'Synthetic label',
          'background': '#654321',
        },
      ],
    }, _connection);

void main() {
  test('options require matching connection and explicit capability', () {
    expect(_options(enabled: false).options, isEmpty);
    expect(
      () => GoogleCalendarColorOptions.fromJson({
        'provider': 'google',
        'connectionId': 'other',
        'providerColorWrites': true,
      }, _connection),
      throwsFormatException,
    );
  });

  testWidgets(
    'actor change while fresh options await never reveals old choices',
    (tester) async {
      final pending = Completer<GoogleCalendarColorOptions?>();
      var currentActor = true;
      await tester.pumpApp(
        Builder(
          builder: (context) => Material(
            child: TextButton(
              onPressed: () => showEventFormSheet(
                context,
                event: CalendarEvent.fromJson(const {
                  'id': 'event',
                  'title': 'Meeting',
                  'provider': 'google',
                  'start_at': '2026-10-02T10:00:00Z',
                  'end_at': '2026-10-02T11:00:00Z',
                }),
                providerColorsFuture: pending.future,
                isCurrentScope: () => currentActor,
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      currentActor = false;
      pending.complete(_options());
      await tester.pumpAndSettle();
      expect(find.byType(GoogleCalendarColorPicker), findsNothing);
    },
  );

  for (final entry in [
    ('inherit', 'inherit', <String, dynamic>{'inherited': true}),
    ('event', '11', <String, dynamic>{'color_id': '11'}),
    ('label', 'label-one', <String, dynamic>{'event_label_id': 'label-one'}),
  ]) {
    testWidgets('${entry.$1} stored choice appears when options arrive', (
      tester,
    ) async {
      final pending = Completer<GoogleCalendarColorOptions?>();
      await tester.pumpApp(
        Builder(
          builder: (context) => Material(
            child: TextButton(
              onPressed: () => showEventFormSheet(
                context,
                event: CalendarEvent.fromJson({
                  'id': 'event',
                  'title': 'Meeting',
                  'provider': 'google',
                  'start_at': '2026-10-02T10:00:00Z',
                  'end_at': '2026-10-02T11:00:00Z',
                  'scheduling_metadata': {'google_color': entry.$3},
                }),
                providerColorsFuture: pending.future,
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      pending.complete(_options());
      await tester.pumpAndSettle();
      final chip = tester.widget<ChoiceChip>(
        find.byKey(ValueKey('google-color-${entry.$1}-${entry.$2}')),
      );
      expect(chip.selected, isTrue);
    });
  }

  for (final kind in ['inherit', 'event', 'label']) {
    testWidgets('$kind actual form selection sends only providerColor', (
      tester,
    ) async {
      Map<String, dynamic>? saved;
      final event = CalendarEvent.fromJson(const {
        'id': 'event',
        'title': 'Meeting',
        'provider': 'google',
        'start_at': '2026-11-01T06:30:45.123456Z',
        'end_at': '2026-11-01T07:30:45.654321Z',
      });
      await tester.pumpApp(
        Builder(
          builder: (context) => Material(
            child: TextButton(
              onPressed: () async {
                saved = await showEventFormSheet(
                  context,
                  event: event,
                  timezone: 'America/New_York',
                  providerColors: _options(),
                );
              },
              child: const Text('Open'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      final id = kind == 'inherit'
          ? 'inherit'
          : kind == 'event'
          ? '11'
          : 'label-one';
      final chip = find.byKey(ValueKey('google-color-$kind-$id'));
      await tester.ensureVisible(chip);
      await tester.tap(chip);
      await tester.ensureVisible(find.text('Save'));
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(saved!.keys, ['providerColor']);
      final choice = saved!['providerColor'] as GoogleCalendarColorChoice;
      expect(choice.toJson(), {
        'connectionId': _connection,
        'kind': kind,
        if (kind != 'inherit') 'id': id,
      });
      expect(event.startAt!.toIso8601String(), '2026-11-01T06:30:45.123456Z');
    });
  }

  for (final scenario in ['disabled', 'combined', 'dates', 'actor-changed']) {
    testWidgets('$scenario blocks unsafe provider save', (tester) async {
      Map<String, dynamic>? saved;
      var currentScope = true;
      final event = CalendarEvent.fromJson(const {
        'id': 'event',
        'title': 'Meeting',
        'provider': 'google',
        'start_at': '2026-10-02T10:00:00Z',
        'end_at': '2026-10-02T11:00:00Z',
      });
      await tester.pumpApp(
        Builder(
          builder: (context) => Material(
            child: TextButton(
              onPressed: () async {
                saved = await showEventFormSheet(
                  context,
                  event: event,
                  providerColors: _options(enabled: scenario != 'disabled'),
                  isCurrentScope: () => currentScope,
                );
              },
              child: const Text('Open'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      if (scenario == 'disabled') {
        expect(find.byType(GoogleCalendarColorPicker), findsNothing);
        expect(find.byType(GestureDetector), findsWidgets);
        return;
      }
      final chip = find.byKey(const ValueKey('google-color-inherit-inherit'));
      await tester.ensureVisible(chip);
      await tester.tap(chip);
      if (scenario == 'combined') {
        await tester.enterText(find.byType(TextField).first, 'Edited title');
        tester.testTextInput.hide();
        await tester.pumpAndSettle();
      } else if (scenario == 'dates') {
        await tester.ensureVisible(find.byType(Switch));
        await tester.tap(find.byType(Switch));
        await tester.pumpAndSettle();
      } else {
        currentScope = false;
      }
      await tester.ensureVisible(find.text('Save'));
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(saved, isNull);
      expect(
        find.text(
          (scenario == 'combined' || scenario == 'dates')
              ? 'Save other changes before changing the Google color.'
              : 'This event is no longer available.',
        ),
        findsOneWidget,
      );
    });
  }
}
