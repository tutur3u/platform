import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/google_calendar_color.dart';
import 'package:mobile/features/calendar/utils/event_layout.dart';
import 'package:mobile/features/calendar/widgets/agenda_view.dart';
import 'package:mobile/features/calendar/widgets/event_card.dart';
import 'package:mobile/features/calendar/widgets/event_detail_sheet.dart';
import 'package:mobile/features/calendar/widgets/event_form_sheet.dart';

import '../../../helpers/helpers.dart';

final _start = DateTime.utc(2026, 11, 20, 2);

CalendarEvent _event({String? location}) => CalendarEvent(
  id: 'event',
  title: 'Review',
  location: location,
  startAt: _start,
  endAt: _start.add(const Duration(hours: 1)),
);

void main() {
  testWidgets('editor saves a place and clears it with an empty string', (
    tester,
  ) async {
    Map<String, dynamic>? saved;
    await tester.pumpApp(
      Builder(
        builder: (context) => TextButton(
          onPressed: () async {
            saved = await showEventFormSheet(
              context,
              isCurrentScope: () => true,
              event: _event(location: 'Room A'),
              timezone: 'UTC',
            );
          },
          child: const Text('Open editor'),
        ),
      ),
    );
    await tester.tap(find.text('Open editor'));
    await tester.pumpAndSettle();

    final fields = tester.widgetList<AppTextField>(find.byType(AppTextField));
    expect(fields.map((field) => field.placeholder), contains('Add location'));
    final location = fields.firstWhere(
      (field) => field.placeholder == 'Add location',
    );
    expect(
      location.inputFormatters?.whereType<LengthLimitingTextInputFormatter>(),
      isNotEmpty,
    );

    await tester.enterText(find.byType(TextField).at(1), 'Building 2');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(saved!['location'], 'Building 2');

    saved = null;
    await tester.tap(find.text('Open editor'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(1), '   ');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(saved!['location'], '');
  });

  testWidgets('a place change cannot ride along with a Google color', (
    tester,
  ) async {
    Map<String, dynamic>? saved;
    await tester.pumpApp(
      Builder(
        builder: (context) => TextButton(
          onPressed: () async {
            saved = await showEventFormSheet(
              context,
              isCurrentScope: () => true,
              providerColors: GoogleCalendarColorOptions.fromJson({
                'provider': 'google',
                'connectionId': '00000000-0000-4000-8000-000000000001',
                'providerColorWrites': true,
                'options': [
                  {'kind': 'inherit', 'background': '#123456'},
                ],
              }, '00000000-0000-4000-8000-000000000001'),
              event: _event(location: 'Room A').copyWith(provider: 'google'),
              timezone: 'UTC',
            );
          },
          child: const Text('Open editor'),
        ),
      ),
    );
    await tester.tap(find.text('Open editor'));
    await tester.pumpAndSettle();
    final chip = find.byKey(const ValueKey('google-color-inherit-inherit'));
    await tester.ensureVisible(chip);
    await tester.pumpAndSettle();
    await tester.tap(chip);
    await tester.enterText(find.byType(TextField).at(1), 'Room B');
    await tester.ensureVisible(find.text('Save'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(saved, isNull);
    expect(
      find.text('Save other changes before changing the Google color.'),
      findsOneWidget,
    );
  });

  testWidgets('detail and agenda show the place and hide a blank one', (
    tester,
  ) async {
    await tester.pumpApp(
      EventDetailContent(event: _event(location: 'Conference Room A')),
    );
    expect(find.text('Conference Room A'), findsOneWidget);
    expect(find.text('Open in Maps'), findsNothing);
    expect(
      tester.widget<AppButton>(find.byType(AppButton)).semanticLabel,
      'Open in Maps',
    );

    await tester.pumpApp(EventDetailContent(event: _event()));
    expect(find.byType(AppButton), findsNothing);

    await tester.pumpApp(
      AgendaView(
        selectedDate: _start,
        events: [_event(location: 'Conference Room A')],
        onEventTap: (_) {},
        onDaySelected: (_) {},
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Conference Room A'), findsOneWidget);

    await tester.pumpApp(
      SizedBox(
        height: 120,
        child: Stack(
          children: [
            EventCard(
              layoutInfo: EventLayoutInfo(
                event: _event(location: 'Conference Room A'),
                column: 0,
                totalColumns: 1,
              ),
              hourHeight: 80,
              timelineLeft: 0,
              timelineWidth: 300,
              onTap: () {},
            ),
          ],
        ),
      ),
    );
    expect(find.text('Conference Room A'), findsOneWidget);
  });
}
