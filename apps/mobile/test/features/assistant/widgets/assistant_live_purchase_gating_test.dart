import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_status_row.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';

void main() {
  final l10n = AppLocalizationsEn();

  Future<void> pumpBlockedLive(WidgetTester tester) => tester.pumpWidget(
    const MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(
        body: AssistantLiveStatusRow(
          liveUiState: AssistantLiveUiState(
            kind: AssistantLiveUiKind.unavailable,
            tone: AssistantLiveUiTone.neutral,
            workspaceTier: 'FREE',
            activeTier: 'FREE',
            creditSource: AssistantCreditSource.workspace,
            isEligible: false,
            isVisibleLiveSession: false,
            showBlockedReason: true,
          ),
          liveState: AssistantLiveState(),
        ),
      ),
    ),
  );

  testWidgets(
    'Apple builds explain a locked Live tier without naming a plan to buy',
    (tester) async {
      await pumpBlockedLive(tester);
      expect(find.text(l10n.assistantLiveTierUnavailable), findsOneWidget);
      expect(find.text(l10n.assistantLiveTierRequired), findsNothing);
      expect(find.textContaining('PLUS'), findsNothing);
    },
    variant: const TargetPlatformVariant({
      TargetPlatform.iOS,
      TargetPlatform.macOS,
    }),
  );

  testWidgets(
    'other platforms keep naming the plan that includes Live',
    (tester) async {
      await pumpBlockedLive(tester);
      expect(find.text(l10n.assistantLiveTierRequired), findsOneWidget);
      expect(find.text(l10n.assistantLiveTierUnavailable), findsNothing);
    },
    variant: const TargetPlatformVariant({
      TargetPlatform.android,
      TargetPlatform.windows,
    }),
  );

  test('both locales provide the neutral Live tier message', () {
    for (final locale in AppLocalizations.supportedLocales) {
      final messages = lookupAppLocalizations(locale);
      expect(messages.assistantLiveTierUnavailable, isNotEmpty);
      expect(messages.assistantLiveTierUnavailable, isNot(contains('PLUS')));
    }
  });
}
