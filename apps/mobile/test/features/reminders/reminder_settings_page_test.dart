import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/reminders/reminder_settings_page.dart';
import 'package:mobile/l10n/l10n.dart';

void main() {
  testWidgets('reminder toggles retain independent timing selections', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: const Scaffold(body: ReminderSettingsPage()),
      ),
    );
    await tester.pumpAndSettle();
    final cards = find.byType(AppCard);
    expect(
      tester.getTopLeft(cards.at(1)).dy - tester.getBottomLeft(cards.first).dy,
      AppSpacing.md,
    );
    expect(find.byType(AppToggleRow), findsNWidgets(2));
    expect(find.byType(AppChip), findsNWidgets(10));
    expect(find.byType(Switch), findsNothing);
    await tester.tap(find.byType(AppSwitch).first);
    await tester.pumpAndSettle();
    expect(find.byType(AppChip), findsNWidgets(5));
    await tester.tap(find.byType(AppSwitch).first);
    await tester.pumpAndSettle();
    expect(find.byType(AppChip), findsNWidgets(10));
    expect(tester.takeException(), isNull);
  });
}
