import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/widgets/assistant_mode_title.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

void main() {
  testWidgets('mode title stays Mira Chat or Mira Live without animation', (
    tester,
  ) async {
    final chrome = AssistantChromeCubit();
    addTearDown(chrome.close);
    await tester.pumpWidget(
      BlocProvider.value(
        value: chrome,
        child: const MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(body: AssistantModeTitle()),
        ),
      ),
    );

    String title() => tester
        .widgetList<Text>(
          find.descendant(
            of: find.byType(AssistantModeTitle),
            matching: find.byType(Text),
          ),
        )
        .map((text) => text.data ?? '')
        .join();

    expect(title(), 'Mira Chat');
    chrome.enterLiveMode();
    await tester.pump();
    expect(title(), 'Mira Live');

    chrome.exitLiveMode();
    await tester.pumpAndSettle();
    expect(title(), 'Mira Chat');
  });
}
