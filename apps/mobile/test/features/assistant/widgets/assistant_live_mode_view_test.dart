import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_controls.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_mode_view.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';
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
                  bottomNavigationBar: ShellDockSurface(
                    child: AssistantLiveCallControls(
                      state: const AssistantLiveState(
                        status: AssistantLiveConnectionStatus.connected,
                        isMicrophoneActive: true,
                      ),
                      onMicrophone: () async {
                        microphoneTaps++;
                      },
                      onCamera: () async {},
                      onText: () async {},
                      onDisconnect: () async {},
                    ),
                  ),
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
        await tester.tap(find.byIcon(LucideIcons.mic).last);
        expect(microphoneTaps, 1);
        final control = tester.getRect(find.byIcon(LucideIcons.keyboard));
        expect(control.bottom, lessThan(size.height));
      });
    }
  }

  testWidgets(
    'renders app-background call activity without a second control rail',
    (tester) async {
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
              onRetry: () async {},
              onToggleMicrophone: () async {},
              onToggleCamera: () async {},
              onDisconnect: () async {},
              onOpenTextEntry: () async {},
            ),
          ),
        ),
      );

      expect(find.text('Gemini 3.8 Live'), findsNothing);
      expect(find.text('Mira Live'), findsNothing);
      expect(
        find.text(
          'Microphone streaming is active. '
          'Mira will keep listening for new audio input.',
        ),
        findsNothing,
      );
      expect(find.text('Available'), findsNothing);
      expect(find.byType(AssistantLiveCallControls), findsNothing);
      expect(find.byType(Card), findsNothing);
      expect(find.text('Mute mic'), findsNothing);
      expect(find.text('Show camera'), findsNothing);
      expect(find.text('Type'), findsNothing);
      // One status line says what is happening now; the navbar names Mira.
      expect(find.text('Voice response is streaming'), findsOneWidget);
      expect(find.text('Your microphone is live'), findsNothing);
      expect(find.byKey(const ValueKey('live-stage-start')), findsNothing);
    },
  );

  testWidgets('keeps the idle state clear for the shell start action', (
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
            onRetry: () async {},
            onToggleMicrophone: () async {},
            onToggleCamera: () async {},
            onDisconnect: () async {},
            onOpenTextEntry: () async {},
          ),
        ),
      ),
    );

    // Idle shows one obvious action and no helper copy or empty transcript.
    expect(find.byKey(const ValueKey('live-stage-start')), findsOneWidget);
    expect(find.text('Start talking'), findsOneWidget);
    expect(find.text('Start live session'), findsNothing);
    expect(find.text('Available'), findsNothing);
    expect(
      find.byKey(const ValueKey('live-retained-transcript')),
      findsNothing,
    );
    expect(find.byKey(const ValueKey('live-stage-status')), findsNothing);
  });

  testWidgets('shows localized recovery without raw provider details', (
    tester,
  ) async {
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
            onRetry: () async {},
            onToggleMicrophone: () async {},
            onToggleCamera: () async {},
            onDisconnect: () async {},
            onOpenTextEntry: () async {},
          ),
        ),
      ),
    );

    expect(find.text('Needs attention'), findsOneWidget);
    expect(find.text('Socket closed unexpectedly.'), findsNothing);
    expect(
      find.text(
        'The live session hit an error. Retry or start a fresh session.',
      ),
      findsOneWidget,
    );
    expect(find.text('Retry live session'), findsOneWidget);
  });

  testWidgets('the stage button and orb both start talking', (tester) async {
    var starts = 0;
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: AssistantLiveModeView(
            chatState: const AssistantChatState(fallbackChatId: 'idle'),
            liveState: const AssistantLiveState(),
            liveUiState: const AssistantLiveUiState(
              kind: AssistantLiveUiKind.available,
              tone: AssistantLiveUiTone.neutral,
              workspaceTier: 'PRO',
              activeTier: 'PRO',
              creditSource: AssistantCreditSource.workspace,
              isEligible: true,
              isVisibleLiveSession: true,
            ),
            assistantName: 'Mira',
            scrollController: ScrollController(),
            onRetry: () async {},
            onToggleMicrophone: () async => starts++,
            onToggleCamera: () async {},
            onDisconnect: () async {},
            onOpenTextEntry: () async {},
          ),
        ),
      ),
    );
    await tester.tap(find.byKey(const ValueKey('live-stage-start')));
    await tester.tap(find.byKey(const ValueKey('live-stage-orb-start')));
    expect(starts, 2);
    expect(find.bySemanticsLabel('Start talking'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
