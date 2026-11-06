import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/calendar_account.dart';
import 'package:mobile/data/models/calendar_connection.dart';
import 'package:mobile/data/models/google_calendar_color.dart';
import 'package:mobile/data/repositories/calendar_connections_repository.dart';
import 'package:mobile/features/calendar/widgets/calendar_connections_sheet.dart';
import 'package:mobile/features/calendar/widgets/event_form_sheet.dart';
import 'package:mobile/features/calendar/widgets/google_calendar_color_picker.dart';

import '../../../helpers/pump_app.dart';

class _Connections extends CalendarConnectionsRepository {
  bool? enabled;
  @override
  Future<List<CalendarAccount>> getAccounts(String wsId) async => const [
    CalendarAccount(
      id: 'account',
      provider: 'google',
      accountName: 'Fixture account',
    ),
  ];
  @override
  Future<List<CalendarConnection>> getConnections(String wsId) async => [
    CalendarConnection(
      id: 'connection',
      wsId: wsId,
      calendarId: 'fixture',
      calendarName: 'Fixture calendar',
      authTokenId: 'account',
    ),
  ];
  @override
  Future<void> toggleConnection({
    required String connectionId,
    required bool isEnabled,
    required String wsId,
  }) async {
    enabled = isEnabled;
  }
}

void main() {
  testWidgets('event editor closes before the route on system Back', (
    tester,
  ) async {
    await tester.pumpApp(
      Builder(
        builder: (context) => AppButton.primary(
          onPressed: () => showEventFormSheet(
            context,
            isCurrentScope: () => true,
            initialStartTime: DateTime(2026, 10, 24, 9),
          ),
          child: const Text('Open calendar editor'),
        ),
      ),
    );
    await tester.tap(find.text('Open calendar editor'));
    await tester.pumpAndSettle();
    expect(find.byType(AppToggleRow), findsOneWidget);
    expect(find.byType(TextField), findsNWidgets(2));
    tester.testTextInput.hide();
    await tester.pumpAndSettle();
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.byType(AppToggleRow), findsNothing);
    expect(find.text('Open calendar editor'), findsOneWidget);
  });

  testWidgets(
    'calendar connections use custom toggles and Back closes the sheet',
    (tester) async {
      final repository = _Connections();
      await tester.pumpApp(
        Builder(
          builder: (context) => AppButton.primary(
            onPressed: () => showCalendarConnectionsSheet(
              context,
              wsId: 'fixture',
              repository: repository,
            ),
            child: const Text('Open connections'),
          ),
        ),
      );
      await tester.tap(find.text('Open connections'));
      await tester.pumpAndSettle();
      expect(find.text('Fixture calendar'), findsOneWidget);
      await tester.tap(find.byType(AppSwitch));
      await tester.pumpAndSettle();
      expect(repository.enabled, isFalse);
      expect(find.byType(Switch), findsNothing);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Fixture calendar'), findsNothing);
      expect(find.text('Open connections'), findsOneWidget);
    },
  );

  testWidgets('provider color preserves the exact selected provider choice', (
    tester,
  ) async {
    GoogleCalendarColorChoice? selected;
    await tester.pumpApp(
      GoogleCalendarColorPicker(
        colors: const GoogleCalendarColorOptions(
          connectionId: 'fixture',
          writesEnabled: true,
          options: [
            GoogleCalendarColorOption(kind: 'inherit', background: '#123456'),
          ],
        ),
        onChanged: (choice) => selected = choice,
      ),
    );
    await tester.tap(find.byType(AppChip));
    expect(selected?.connectionId, 'fixture');
    expect(selected?.kind, 'inherit');
    expect(selected?.id, isNull);
  });
}
