import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_controls.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

void main() {
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
      await tester.tap(find.byIcon(Icons.mic_off_rounded));
      await tester.tap(find.byIcon(Icons.videocam_off_rounded));
      await tester.tap(find.byIcon(Icons.call_end_rounded));
      expect(microphone, state.isBusy ? 0 : 1);
      expect(camera, status == AssistantLiveConnectionStatus.connected ? 1 : 0);
      expect(end, status == AssistantLiveConnectionStatus.disconnected ? 0 : 1);
      expect(tester.takeException(), isNull);
    });
  }
}
