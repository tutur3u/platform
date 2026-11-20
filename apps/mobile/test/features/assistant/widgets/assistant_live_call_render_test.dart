import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/safe_error_diagnostics.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_failure.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_chat_feedback.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_view.dart';

import '../../../helpers/design_render_harness.dart';

Future<void> _noop() async {}

const _actions = AssistantLiveCallActions(
  toggleMicrophone: _noop,
  toggleCamera: _noop,
  openKeyboard: _noop,
  end: _noop,
  callAgain: _noop,
  minimize: _noop,
);

/// Design renders of the Live call states and the chat reply failure banner.
void main() {
  final started = DateTime(2026, 11, 20, 9);
  final liveStates = <String, AssistantLiveState>{
    'connecting': const AssistantLiveState(
      status: AssistantLiveConnectionStatus.connecting,
    ),
    'listening': AssistantLiveState(
      status: AssistantLiveConnectionStatus.connected,
      isMicrophoneActive: true,
      audioLevel: .5,
      callStartedAt: started,
    ),
    'speaking': AssistantLiveState(
      status: AssistantLiveConnectionStatus.connected,
      isMicrophoneActive: true,
      isAssistantSpeaking: true,
      assistantAudioLevel: .6,
      assistantSpectrum: const [.7, .4, .3],
      callStartedAt: started,
    ),
    'failed-paused': const AssistantLiveState(
      status: AssistantLiveConnectionStatus.error,
      error: AssistantLiveFailure.paused,
    ),
    'failed-microphone': const AssistantLiveState(
      status: AssistantLiveConnectionStatus.error,
      error: AssistantLiveFailure.microphonePermission,
    ),
  };

  for (final theme in ['light', 'dark']) {
    final (settings, brightness) = DesignRender.themes[theme]!;
    for (final entry in liveStates.entries) {
      testWidgets('Live ${entry.key} renders in $theme', (tester) async {
        await DesignRender.loadFonts();
        DesignRender.setSize(tester, DesignRender.sizes['phone']!);
        await tester.pumpWidget(
          DesignRenderApp(
            settings: settings,
            brightness: brightness,
            child: AssistantLiveCallView(
              state: entry.value,
              assistantName: 'Mira',
              actions: _actions,
            ),
          ),
        );
        await tester.pump(const Duration(milliseconds: 900));
        expect(tester.takeException(), isNull);
        await DesignRender.capture(tester, 'mira-live/$theme-${entry.key}');
      });
    }

    testWidgets('chat reply failure renders in $theme', (tester) async {
      await DesignRender.loadFonts();
      DesignRender.setSize(tester, const Size(390, 160));
      await tester.pumpWidget(
        DesignRenderApp(
          settings: settings,
          brightness: brightness,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: AssistantChatFeedback(
              state: const AssistantChatState(
                fallbackChatId: 'render-chat',
                status: AssistantChatStatus.error,
                diagnostics: SafeErrorDiagnostics.streamFailure(),
              ),
              onRetry: () {},
            ),
          ),
        ),
      );
      await tester.pump();
      expect(
        find.byKey(const ValueKey('assistant-reply-failure-interrupted')),
        findsOneWidget,
      );
      await DesignRender.capture(tester, 'mira-live/$theme-chat-failure');
    });
  }
}
