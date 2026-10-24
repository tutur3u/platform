import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_playback_blob.dart';
import 'package:mobile/l10n/l10n.dart';

import 'assistant_live_shell_harness.dart';

void main() {
  for (final locale in ['en', 'vi']) {
    for (final ime in [0.0, 280.0]) {
      testWidgets(
        'permission, recovery and ended retain a reachable transcript '
        '$locale IME=$ime',
        (tester) async {
          tester.view
            ..physicalSize = const Size(320, 844)
            ..devicePixelRatio = 1;
          addTearDown(() {
            tester.view.resetPhysicalSize();
            tester.view.resetDevicePixelRatio();
          });
          final controller = LiveShellTestController(
            LiveShellFrame(
              state: liveShellState(AssistantLiveConnectionStatus.error)
                  .copyWith(
                    microphonePermission: AssistantLivePermissionState.denied,
                    error: 'private provider or permission details',
                  ),
            ),
          );
          addTearDown(controller.dispose);
          await tester.pumpWidget(
            AssistantLiveShellHarness(
              controller: controller,
              width: 320,
              scale: 2,
              locale: locale,
              ime: ime,
              reducedMotion: true,
            ),
          );
          await tester.pump();
          await tester.pump();
          final l10n = tester.element(find.byType(Scaffold)).l10n;
          expect(find.text(l10n.assistantLivePermissionDenied), findsOneWidget);
          expect(
            find.text('private provider or permission details'),
            findsNothing,
          );
          expect(find.text(l10n.assistantLiveStageYouListening), findsNothing);
          expect(find.text(l10n.assistantLiveRetryAction), findsOneWidget);
          await tester.ensureVisible(find.text(l10n.assistantLiveRetryAction));
          await tester.tap(find.text(l10n.assistantLiveRetryAction));
          await tester.pump();
          expect(controller.retries, 1);
          expect(
            tester
                .widget<AssistantLivePlaybackBlob>(
                  find.byType(AssistantLivePlaybackBlob),
                )
                .active,
            isFalse,
          );
          final material = find.byKey(
            const ValueKey('persistent-shell-dock-material'),
          );
          final bounds = tester.getRect(material);
          final transcript = find.text(
            'Your conversation stays here while we reconnect.',
            findRichText: true,
          );
          for (final state in [
            controller.value.state,
            liveShellState(
              AssistantLiveConnectionStatus.reconnecting,
            ).copyWith(error: 'transient failure'),
            liveShellState(
              AssistantLiveConnectionStatus.disconnected,
              ended: true,
            ),
          ]) {
            controller.value = LiveShellFrame(state: state);
            await tester.pump();
            await tester.pump();
            controller.scroll.jumpTo(
              controller.scroll.position.maxScrollExtent,
            );
            await tester.pump();
            expect(transcript, findsOneWidget);
            expect(
              tester.getRect(transcript).bottom,
              lessThan(tester.getRect(material).top - 16),
            );
            expect(tester.getRect(material), bounds);
            expect(tester.takeException(), isNull);
          }
          expect(find.text(l10n.assistantLiveCallEnded), findsOneWidget);
          await tester.tap(find.byKey(const ValueKey('live-control-keyboard')));
          await tester.pump();
          expect(controller.keyboard, 1);
        },
      );
    }
  }
}
