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
  for (final size in [
    const Size(320, 720),
    const Size(844, 390),
    const Size(768, 1024),
    const Size(1376, 1032),
  ]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('Live controls fit $size at text scale $scale', (
        tester,
      ) async {
        tester.view
          ..physicalSize = size
          ..devicePixelRatio = 1;
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });
        final scroll = ScrollController();
        addTearDown(scroll.dispose);
        var microphoneTaps = 0;
        await tester.pumpWidget(
          MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: Builder(
              builder: (context) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: TextScaler.linear(scale)),
                child: Scaffold(
                  body: AssistantLiveModeView(
                    chatState: const AssistantChatState(
                      fallbackChatId: 'responsive-live',
                    ),
                    liveState: const AssistantLiveState(
                      status: AssistantLiveConnectionStatus.connected,
                      isMicrophoneActive: true,
                    ),
                    liveUiState: const AssistantLiveUiState(
                      kind: AssistantLiveUiKind.live,
                      tone: AssistantLiveUiTone.positive,
                      workspaceTier: 'PRO',
                      activeTier: 'FREE',
                      creditSource: AssistantCreditSource.personal,
                      isEligible: true,
                      isVisibleLiveSession: true,
                    ),
                    assistantName: 'Mira',
                    scrollController: scroll,
                    onClose: () async {},
                    onRetry: () async {},
                    onToggleMicrophone: () async {
                      microphoneTaps++;
                    },
                    onToggleCamera: () async {},
                    onDisconnect: () async {},
                    onOpenTextEntry: () async {},
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.tap(find.byIcon(Icons.mic_rounded).last);
        expect(microphoneTaps, 1);
        final control = tester.getRect(find.byIcon(Icons.keyboard_rounded));
        expect(control.bottom, lessThan(size.height));
      });
    }
  }

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

    expect(find.text('Gemini 3.8 Live'), findsOneWidget);
    expect(
      find.text(
        'Microphone streaming is active. '
        'Mira will keep listening for new audio input.',
      ),
      findsNothing,
    );
    expect(find.text('Live'), findsWidgets);
    expect(find.text('Mute mic'), findsOneWidget);
    expect(find.text('Show camera'), findsOneWidget);
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
