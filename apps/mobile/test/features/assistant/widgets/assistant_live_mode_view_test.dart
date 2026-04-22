import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_mode_view.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

void main() {
  testWidgets('renders live model badge, activity labels, and controls', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: AssistantLiveModeView(
            chatState: const AssistantChatState(
              fallbackChatId: 'fallback-chat',
            ),
            liveState: const AssistantLiveState(
              status: AssistantLiveConnectionStatus.connected,
              isMicrophoneActive: true,
              audioLevel: 0.72,
              assistantAudioLevel: 0.48,
              isAssistantSpeaking: true,
            ),
            liveUiState: const AssistantLiveUiState(
              kind: AssistantLiveUiKind.live,
              tone: AssistantLiveUiTone.positive,
              workspaceTier: 'PRO',
              activeTier: 'PRO',
              creditSource: AssistantCreditSource.workspace,
              isEligible: true,
              isVisibleLiveSession: true,
            ),
            assistantName: 'Mira',
            scrollController: ScrollController(),
            onClose: () async {},
            onRetry: () async {},
            onToggleMicrophone: () async {},
            onToggleCamera: () async {},
            onDisconnect: () async {},
            onOpenTextEntry: () async {},
          ),
        ),
      ),
    );

    expect(find.text('Gemini 3.1 Flash Live'), findsOneWidget);
    expect(find.text('Live transcript'), findsOneWidget);
    expect(
      find.text(
        'Microphone streaming is active. '
        'Mira will keep listening for new audio input.',
      ),
      findsOneWidget,
    );
    expect(find.text('Mute mic'), findsOneWidget);
    expect(find.text('Type'), findsOneWidget);
    expect(find.text('Mira'), findsWidgets);
    expect(find.text('Your microphone is live'), findsOneWidget);
    expect(find.text('Voice response is streaming'), findsOneWidget);
  });

  testWidgets('shows empty transcript guidance when no turns exist', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: AssistantLiveModeView(
            chatState: const AssistantChatState(
              fallbackChatId: 'fallback-chat',
            ),
            liveState: const AssistantLiveState(),
            liveUiState: const AssistantLiveUiState(
              kind: AssistantLiveUiKind.preparing,
              tone: AssistantLiveUiTone.warning,
              workspaceTier: 'PRO',
              activeTier: 'PRO',
              creditSource: AssistantCreditSource.workspace,
              isEligible: true,
              isVisibleLiveSession: true,
            ),
            assistantName: 'Mira',
            scrollController: ScrollController(),
            onClose: () async {},
            onRetry: () async {},
            onToggleMicrophone: () async {},
            onToggleCamera: () async {},
            onDisconnect: () async {},
            onOpenTextEntry: () async {},
          ),
        ),
      ),
    );

    expect(
      find.text(
        'Start talking or type from the keyboard action below. '
        'Live drafts and synced turns will appear here.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('shows inline error details in the live header', (tester) async {
    tester.view.physicalSize = const Size(1179, 2556);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: AssistantLiveModeView(
            chatState: const AssistantChatState(
              fallbackChatId: 'fallback-chat',
            ),
            liveState: const AssistantLiveState(
              status: AssistantLiveConnectionStatus.error,
              error: 'Socket closed unexpectedly.',
            ),
            liveUiState: const AssistantLiveUiState(
              kind: AssistantLiveUiKind.error,
              tone: AssistantLiveUiTone.error,
              workspaceTier: 'PRO',
              activeTier: 'PRO',
              creditSource: AssistantCreditSource.workspace,
              isEligible: true,
              isVisibleLiveSession: true,
              error: 'Socket closed unexpectedly.',
            ),
            assistantName: 'Mira',
            scrollController: ScrollController(),
            onClose: () async {},
            onRetry: () async {},
            onToggleMicrophone: () async {},
            onToggleCamera: () async {},
            onDisconnect: () async {},
            onOpenTextEntry: () async {},
          ),
        ),
      ),
    );

    expect(find.text('Needs attention'), findsNWidgets(2));
    expect(find.text('Socket closed unexpectedly.'), findsOneWidget);
    expect(find.text('Retry live session'), findsOneWidget);
  });
}
