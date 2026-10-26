import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_mode_view.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_playback_blob.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_screen_control.dart';
import 'package:mobile/l10n/l10n.dart';

void main() {
  for (final locale in ['en', 'vi']) {
    for (final reducedMotion in [false, true]) {
      testWidgets(
        'stage and transcript survive reconnect $locale motion=$reducedMotion',
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
          var state = const AssistantLiveState(
            status: AssistantLiveConnectionStatus.connected,
            isMicrophoneActive: true,
            isAssistantSpeaking: true,
            userDraft: 'Retained pending turn',
          );
          late StateSetter update;
          await tester.pumpWidget(
            MaterialApp(
              locale: Locale(locale),
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              home: StatefulBuilder(
                builder: (context, setState) {
                  update = setState;
                  final kind =
                      state.status == AssistantLiveConnectionStatus.connected
                      ? AssistantLiveUiKind.live
                      : AssistantLiveUiKind.values.byName(state.status.name);
                  return MediaQuery(
                    data: MediaQueryData(
                      size: const Size(320, 390),
                      textScaler: const TextScaler.linear(2),
                      disableAnimations: reducedMotion,
                    ),
                    child: Scaffold(
                      body: AssistantLiveModeView(
                        chatState: const AssistantChatState(
                          fallbackChatId: 'synthetic-chat',
                        ),
                        liveState: state,
                        liveUiState: AssistantLiveUiState(
                          kind: kind,
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
                  );
                },
              ),
            ),
          );
          final stage = find.byKey(const ValueKey('live-call-stage'));
          final transcript = find.byKey(
            const ValueKey('live-retained-transcript'),
          );
          final stageElement = tester.element(stage);
          final transcriptElement = tester.element(transcript);
          for (final status in [
            AssistantLiveConnectionStatus.preparing,
            AssistantLiveConnectionStatus.connecting,
            AssistantLiveConnectionStatus.reconnecting,
            AssistantLiveConnectionStatus.connected,
          ]) {
            update(() => state = state.copyWith(status: status));
            await tester.pump(const Duration(milliseconds: 100));
            expect(tester.element(stage), same(stageElement));
            expect(tester.element(transcript), same(transcriptElement));
            expect(
              find.text('Retained pending turn', findRichText: true),
              findsOneWidget,
            );
            final blob = tester.widget<AssistantLivePlaybackBlob>(
              find.byType(AssistantLivePlaybackBlob),
            );
            expect(
              blob.active,
              status == AssistantLiveConnectionStatus.connected,
            );
            if (status != AssistantLiveConnectionStatus.connected) {
              expect(find.byType(AssistantLiveScreenControl), findsNothing);
              expect(find.text('Your microphone is live'), findsNothing);
              expect(find.text('Micrô của bạn đang bật'), findsNothing);
            }
            expect(tester.takeException(), isNull);
          }
        },
      );
    }
  }
}
