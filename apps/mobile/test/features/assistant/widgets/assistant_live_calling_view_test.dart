import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_mode_view.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_screen_control.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

void main() {
  for (final status in [
    AssistantLiveConnectionStatus.preparing,
    AssistantLiveConnectionStatus.connecting,
    AssistantLiveConnectionStatus.reconnecting,
  ]) {
    testWidgets(
      '$status shows truthful calling stage without connected media',
      (tester) async {
        tester.view
          ..physicalSize = const Size(320, 390)
          ..devicePixelRatio = 1;
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });
        final scroll = ScrollController();
        addTearDown(scroll.dispose);
        await tester.pumpWidget(
          MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: MediaQuery(
              data: const MediaQueryData(
                size: Size(320, 390),
                textScaler: TextScaler.linear(2),
              ),
              child: Scaffold(
                body: AssistantLiveModeView(
                  chatState: const AssistantChatState(
                    fallbackChatId: 'synthetic-chat',
                  ),
                  liveState: AssistantLiveState(
                    status: status,
                    isMicrophoneActive: true,
                    userDraft: 'synthetic pending',
                  ),
                  liveUiState: AssistantLiveUiState(
                    kind: AssistantLiveUiKind.values.byName(status.name),
                    tone: AssistantLiveUiTone.neutral,
                    workspaceTier: 'PRO',
                    activeTier: 'PRO',
                    creditSource: AssistantCreditSource.workspace,
                    isEligible: true,
                    isVisibleLiveSession: true,
                  ),
                  assistantName: 'Mira',
                  scrollController: scroll,
                  onRetry: () async {},
                  onToggleMicrophone: () async {},
                  onToggleCamera: () async {},
                  onDisconnect: () async {},
                  onOpenTextEntry: () async {},
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('Calling Mira'), findsOneWidget);
        expect(find.text('Your microphone is live'), findsNothing);
        expect(find.text('synthetic pending'), findsNothing);
        expect(find.byType(AssistantLiveScreenControl), findsNothing);
        expect(find.byIcon(Icons.call_rounded), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
