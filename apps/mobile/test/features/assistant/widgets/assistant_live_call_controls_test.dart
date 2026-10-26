import 'dart:async';
import 'dart:ui' show Tristate;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_controls.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/features/shell/view/shell_dock_control_item.dart';
import 'package:mobile/l10n/l10n.dart';

import 'assistant_live_shell_harness.dart';

void main() {
  testWidgets('stable toggle slots exclude duplicate taps and honor haptics', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    final enabled = AppHaptics.enabled;
    AppHaptics.enabled = false;
    final platformCalls = <MethodCall>[];
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          ..setMockMethodCallHandler(SystemChannels.platform, (call) async {
            platformCalls.add(call);
            return null;
          });
    try {
      final pending = Completer<void>();
      var calls = 0;
      var active = true;
      late StateSetter update;
      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) {
                update = setState;
                return Center(
                  child: SizedBox(
                    width: 236,
                    child: AssistantLiveCallControls(
                      state: AssistantLiveState(
                        status: AssistantLiveConnectionStatus.connected,
                        isMicrophoneActive: active,
                      ),
                      onMicrophone: () async {
                        calls++;
                        await pending.future;
                      },
                      onCamera: () async {},
                      onText: () async {},
                      onDisconnect: () async {},
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      );
      final mic = find.byKey(const ValueKey('live-control-microphone'));
      final identity = tester.element(mic);
      final center = tester.getCenter(mic);
      expect(find.byType(ShellDockControlItem), findsNWidgets(4));
      expect(find.byType(AppIconButton), findsNWidgets(4));
      expect(find.byType(ShellDockActionButton), findsNothing);
      for (final id in liveControlIds) {
        final rect = tester.getRect(find.byKey(ValueKey('live-control-$id')));
        expect(rect.width, greaterThanOrEqualTo(48));
        expect(rect.height, greaterThanOrEqualTo(48));
      }
      expect(
        tester.getSemantics(mic).flagsCollection.isToggled,
        Tristate.isTrue,
      );
      expect(
        tester
            .getSemantics(find.byKey(const ValueKey('live-control-exit')))
            .flagsCollection
            .isToggled,
        Tristate.none,
      );
      await tester.tap(mic);
      await tester.pump();
      await tester.tap(mic);
      expect(calls, 1);
      final button = tester.widget<AppIconButton>(
        find.descendant(of: mic, matching: find.byType(AppIconButton)),
      );
      expect(button.onPressed, isNull);
      pending.complete();
      await tester.pump();
      update(() => active = false);
      await tester.pump(const Duration(milliseconds: 100));
      expect(tester.element(mic), same(identity));
      expect(tester.getCenter(mic), center);
      expect(find.byTooltip('Open mic'), findsOneWidget);
      expect(
        tester.getSemantics(mic).flagsCollection.isToggled,
        Tristate.isFalse,
      );
      expect(
        platformCalls.where((call) => call.method == 'HapticFeedback.vibrate'),
        isEmpty,
      );
      expect(tester.takeException(), isNull);
    } finally {
      handle.dispose();
      AppHaptics.enabled = enabled;
      messenger.setMockMethodCallHandler(SystemChannels.platform, null);
    }
  });

  for (final status in AssistantLiveConnectionStatus.values) {
    testWidgets('four real controls map $status callbacks without new media', (
      tester,
    ) async {
      var microphone = 0;
      var camera = 0;
      var keyboard = 0;
      var exit = 0;
      final state = AssistantLiveState(status: status);
      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: AssistantLiveCallControls(
              state: state,
              onMicrophone: () async {
                microphone++;
              },
              onCamera: () async {
                camera++;
              },
              onText: () async {
                keyboard++;
              },
              onDisconnect: () async {
                exit++;
              },
            ),
          ),
        ),
      );
      expect(find.byType(AppIconButton), findsNWidgets(4));
      for (final id in liveControlIds) {
        await tester.tap(find.byKey(ValueKey('live-control-$id')));
        await tester.pump();
      }
      expect(microphone, state.isBusy ? 0 : 1);
      expect(camera, status == AssistantLiveConnectionStatus.connected ? 1 : 0);
      expect(keyboard, 1);
      expect(exit, 1);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
    'reconnecting permits stopping active media without starting it',
    (tester) async {
      var microphoneStops = 0;
      var cameraStops = 0;
      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: AssistantLiveCallControls(
              state: const AssistantLiveState(
                status: AssistantLiveConnectionStatus.reconnecting,
                isMicrophoneActive: true,
                isCameraActive: true,
              ),
              onMicrophone: () async {
                microphoneStops++;
              },
              onCamera: () async {
                cameraStops++;
              },
              onText: () async {},
              onDisconnect: () async {},
            ),
          ),
        ),
      );
      expect(find.byTooltip('Mute mic'), findsOneWidget);
      expect(find.byTooltip('Hide camera'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('live-control-microphone')));
      await tester.tap(find.byKey(const ValueKey('live-control-camera')));
      await tester.pump();
      expect(microphoneStops, 1);
      expect(cameraStops, 1);
      expect(tester.takeException(), isNull);
    },
  );
}
