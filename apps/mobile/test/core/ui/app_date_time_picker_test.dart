import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';

void main() {
  testWidgets('Back closes date picker before leaving its route', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: AppButton.primary(
              child: const Text('Detail route'),
              onPressed: () => showAppDatePicker(
                context: context,
                initialDate: DateTime(2024, 2, 29),
                firstDate: DateTime(2020),
                lastDate: DateTime(2030),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Detail route'));
    await tester.pumpAndSettle();
    expect(find.byType(AppDatePicker), findsOneWidget);
    expect(find.byType(CalendarDatePicker), findsNothing);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.byType(AppDatePicker), findsNothing);
    expect(find.text('Detail route'), findsOneWidget);
  });

  testWidgets('date picker returns leap day and enforces bounds', (
    tester,
  ) async {
    DateTime? selected;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: AppButton.primary(
              child: const Text('Open'),
              onPressed: () async {
                selected = await showAppDatePicker(
                  context: context,
                  initialDate: DateTime(2024, 2, 29),
                  firstDate: DateTime(2024, 2, 20),
                  lastDate: DateTime(2024, 2, 29),
                );
              },
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    final blocked = tester.widget<AppButton>(
      find.widgetWithText(AppButton, '19'),
    );
    expect(blocked.onPressed, isNull);
    await tester.tap(find.text('29'));
    await tester.pumpAndSettle();
    expect(selected, DateTime(2024, 2, 29));
  });

  testWidgets('time picker preserves midnight and validates minutes', (
    tester,
  ) async {
    TimeOfDay? selected;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: AppButton.primary(
              child: const Text('Open'),
              onPressed: () async {
                selected = await showAppTimePicker(
                  context: context,
                  initialTime: const TimeOfDay(hour: 0, minute: 5),
                );
              },
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, '99');
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    expect(selected, isNull);
    expect(find.byType(AppTimePicker), findsOneWidget);
    await tester.enterText(find.byType(TextField).last, '05');
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    expect(selected, const TimeOfDay(hour: 0, minute: 5));
  });
}
