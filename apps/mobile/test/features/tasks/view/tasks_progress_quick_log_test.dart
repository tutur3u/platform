import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/tasks/view/tasks_progress_quick_log.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

void main() {
  testWidgets('rejects zero and can close after an unexpected save error', (
    tester,
  ) async {
    var writes = 0;
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showTasksProgressQuickLog(
                context,
                metrics: [
                  (id: 'metric', name: 'Words', unit: 'words', total: true),
                ],
                save: (_, _, _) async {
                  writes++;
                  throw StateError('unexpected');
                },
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    final amount = find.byType(TextFormField).first;
    await tester.enterText(amount, '0.00');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(writes, 0);
    expect(find.text('Enter a valid number'), findsOneWidget);

    await tester.enterText(amount, '1');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(writes, 1);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
  });
}
