import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';

import 'assistant_component_raster.dart';
import 'assistant_live_shell_harness.dart';

void main() {
  setUpAll(loadAssistantRenderFonts);
  for (final brightness in Brightness.values) {
    testWidgets('390x844 real shell Live ${brightness.name} raster', (
      tester,
    ) async {
      configureAssistantRaster(
        tester,
        environmentKey: 'ASSISTANT_LIVE_RENDER_DIR',
      );
      tester.view
        ..physicalSize = const Size(390, 844)
        ..devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      final controller = LiveShellTestController(
        LiveShellFrame(
          state: liveShellState(AssistantLiveConnectionStatus.connected)
              .copyWith(
                isAssistantSpeaking: true,
                assistantAudioLevel: .62,
                assistantSpectrum: const [.55, .35, .7],
              ),
        ),
      );
      addTearDown(controller.dispose);
      await tester.pumpWidget(
        AssistantLiveShellHarness(
          controller: controller,
          brightness: brightness,
        ),
      );
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      expect(find.byType(ShellDockSurface), findsOneWidget);
      expect(find.text('Voice response is streaming'), findsOneWidget);
      expect(
        find.text(
          'Your conversation stays here while we reconnect.',
          findRichText: true,
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
      await renderAssistantComponent(
        tester,
        'mira-live-shell-${brightness.name}-390x844',
        environmentKey: 'ASSISTANT_LIVE_RENDER_DIR',
      );
    });
  }
}
