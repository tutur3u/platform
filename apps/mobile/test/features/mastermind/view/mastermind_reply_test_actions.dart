import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_list_row.dart';

/// The sticky primary action once [option] is chosen.
Finder sendOptionButton(String option) =>
    find.widgetWithText(AppButton, 'Send “$option”');

/// Selects [option] and taps the sticky "Send “option”" action.
Future<void> chooseAndSend(WidgetTester tester, String option) async {
  final row = find.widgetWithText(MastermindOptionRow, option);
  await tester.ensureVisible(row);
  await tester.pumpAndSettle();
  await tester.tap(row);
  await tester.pump();
  await tester.tap(sendOptionButton(option));
}

/// Whether the option row for [option] can be chosen.
bool optionEnabled(WidgetTester tester, String option) =>
    tester
        .widget<MastermindOptionRow>(
          find.widgetWithText(MastermindOptionRow, option),
        )
        .onTap !=
    null;

/// Expands the collapsed "Write your own" field when the page shows it.
Future<void> openWriteYourOwn(WidgetTester tester) async {
  final writer = find.text('Write your own');
  if (writer.evaluate().isEmpty) return;
  if (find.byType(EditableText).evaluate().isNotEmpty) return;
  await tester.ensureVisible(writer);
  await tester.pumpAndSettle();
  await tester.tap(writer);
  await tester.pumpAndSettle();
}

/// Scrolls [finder] into view, then taps it.
Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pump();
}
