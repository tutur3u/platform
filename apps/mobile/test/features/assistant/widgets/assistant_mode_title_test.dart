import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/widgets/assistant_header_status_chip.dart';
import 'package:mobile/features/assistant/widgets/assistant_mode_title.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
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
  testWidgets('current name in both modes; local status in Chat only', (
    tester,
  ) async {
    final chrome = AssistantChromeCubit();
    final titles = ShellTitleOverrideCubit();
    addTearDown(chrome.close);
    addTearDown(titles.close);
    titles.register(
      registrationId: 'assistant',
      ownerId: 'assistant',
      locations: {'/assistant'},
      title: 'Atlas',
      subtitle: 'On device',
      onSubtitlePressed: () {},
    );
    await tester.pumpWidget(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: chrome),
          BlocProvider.value(value: titles),
        ],
        child: const MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(body: AssistantModeTitle()),
        ),
      ),
    );
    expect(find.text('Atlas'), findsOneWidget);
    expect(find.byType(AssistantHeaderStatusChip), findsOneWidget);
    chrome.enterLiveMode();
    await tester.pumpAndSettle();
    expect(find.text('Atlas'), findsOneWidget);
    expect(find.byType(AssistantHeaderStatusChip), findsNothing);
    titles.register(
      registrationId: 'assistant',
      ownerId: 'assistant',
      locations: {'/assistant'},
      title: 'Renamed',
    );
    await tester.pumpAndSettle();
    expect(find.text('Renamed'), findsOneWidget);
    expect(find.text('Atlas'), findsNothing);
  });
}
