import 'dart:async';
import 'dart:ui' show Tristate;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_controls.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

void main() {
  testWidgets('shared navbar controls preserve geometry, toggles, busy '
      'and haptic preference', (tester) async {
    tester.view
      ..physicalSize = const Size(320, 720)
      ..devicePixelRatio = 1;
    final semanticsHandle = tester.ensureSemantics();
    try {
      final wasEnabled = AppHaptics.enabled;
      AppHaptics.enabled = false;
      final platformCalls = <MethodCall>[];
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            ..setMockMethodCallHandler(SystemChannels.platform, (call) async {
              platformCalls.add(call);
              return null;
            });
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        AppHaptics.enabled = wasEnabled;
        messenger.setMockMethodCallHandler(SystemChannels.platform, null);
      });
      final toggling = Completer<void>();
      var taps = 0;
      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: Center(
              child: SizedBox(
                width: 264,
                child: AssistantLiveCallControls(
                  state: const AssistantLiveState(
                    status: AssistantLiveConnectionStatus.connected,
                    isMicrophoneActive: true,
                  ),
                  onMicrophone: () async {
                    taps++;
                    await toggling.future;
                  },
                  onCamera: () async {},
                  onText: () async {},
                  onDisconnect: () async {},
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(ShellDockActionButton), findsNWidgets(4));
      expect(find.byType(IconButton), findsNothing);
      for (final button in find.byType(FilledButton).evaluate()) {
        expect(
          tester.getSize(
            find.byElementPredicate((element) => element == button),
          ),
          const Size(48, 48),
        );
      }
      final semantics = tester.getSemantics(find.byTooltip('Mute mic'));
      expect(semantics.flagsCollection.isToggled != Tristate.none, isTrue);
      expect(semantics.flagsCollection.isToggled == Tristate.isTrue, isTrue);
      expect(
        tester
                .getSemantics(find.byIcon(Icons.call_end_rounded))
                .flagsCollection
                .isToggled !=
            Tristate.none,
        isFalse,
      );
      await tester.tap(find.byTooltip('Mute mic'));
      await tester.pump();
      expect(taps, 1);
      final busy = tester.widget<ShellDockActionButton>(
        find.byType(ShellDockActionButton).first,
      );
      expect(busy.action.enabled, isFalse);
      expect(
        platformCalls.where((call) => call.method == 'HapticFeedback.vibrate'),
        isEmpty,
      );
      toggling.complete();
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<ShellDockActionButton>(
              find.byType(ShellDockActionButton).first,
            )
            .action
            .enabled,
        isTrue,
      );
      expect(tester.takeException(), isNull);
    } finally {
      semanticsHandle.dispose();
    }
  });

  for (final status in AssistantLiveConnectionStatus.values) {
    testWidgets('dock actions reflect actual $status state', (tester) async {
      var microphone = 0;
      var camera = 0;
      var end = 0;
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
              onText: () async {},
              onDisconnect: () async {
                end++;
              },
            ),
          ),
        ),
      );
      if (status == AssistantLiveConnectionStatus.connected) {
        await tester.tap(find.byIcon(Icons.mic_off_rounded));
        await tester.tap(find.byIcon(Icons.videocam_off_rounded));
        await tester.tap(find.byIcon(Icons.call_end_rounded));
        expect(microphone, 1);
        expect(camera, 1);
        expect(end, 1);
      } else {
        expect(find.byType(IconButton), findsNothing);
        expect(microphone + camera + end, 0);
      }
      expect(tester.takeException(), isNull);
    });
  }
}
