import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_playback_blob.dart';

void main() {
  Widget app({
    required bool reducedMotion,
    bool active = false,
    double energy = 0,
    AssistantLiveOrbMode? mode,
  }) => MaterialApp(
    home: MediaQuery(
      data: MediaQueryData(disableAnimations: reducedMotion),
      child: Center(
        child: AssistantLivePlaybackBlob(
          energy: energy,
          bands: const [.7, .2, .1],
          active: active,
          mode: mode,
        ),
      ),
    ),
  );

  testWidgets('orb keeps moving while idle, failed or connecting', (
    tester,
  ) async {
    for (final mode in AssistantLiveOrbMode.values) {
      await tester.pumpWidget(app(reducedMotion: false, mode: mode));
      await tester.pump(const Duration(milliseconds: 500));
      expect(tester.binding.hasScheduledFrame, isTrue, reason: mode.name);
      expect(
        find.byKey(const ValueKey('assistant-playback-spectrum')),
        findsOneWidget,
      );
    }
    expect(find.byIcon(LucideIcons.audioLines), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('speaking smooths PCM; reduced motion renders a still frame', (
    tester,
  ) async {
    await tester.pumpWidget(
      app(reducedMotion: false, active: true, energy: .5),
    );
    await tester.pump(const Duration(milliseconds: 120));
    var animated = tester.widget<TweenAnimationBuilder<List<double>>>(
      find.byType(TweenAnimationBuilder<List<double>>),
    );
    expect(animated.duration, const Duration(milliseconds: 90));
    expect(
      tester
          .widget<AssistantLivePlaybackBlob>(
            find.byType(AssistantLivePlaybackBlob),
          )
          .effectiveMode,
      AssistantLiveOrbMode.speaking,
    );

    await tester.pumpWidget(app(reducedMotion: true, energy: double.nan));
    await tester.pumpAndSettle();
    animated = tester.widget<TweenAnimationBuilder<List<double>>>(
      find.byType(TweenAnimationBuilder<List<double>>),
    );
    expect(animated.duration, Duration.zero);
    expect(tester.takeException(), isNull);
    expect(tester.binding.hasScheduledFrame, isFalse);
  });
}
