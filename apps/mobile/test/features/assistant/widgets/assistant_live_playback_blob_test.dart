import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_playback_blob.dart';

void main() {
  for (final reducedMotion in [false, true]) {
    testWidgets('PCM blob respects reduced motion $reducedMotion and idle', (
      tester,
    ) async {
      Widget app({required bool active, required double energy}) => MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(disableAnimations: reducedMotion),
          child: AssistantLivePlaybackBlob(
            energy: energy,
            bands: const [.7, .2, .1],
            active: active,
          ),
        ),
      );
      await tester.pumpWidget(app(active: true, energy: .5));
      await tester.pumpAndSettle();
      final animated = tester.widget<TweenAnimationBuilder<List<double>>>(
        find.byType(TweenAnimationBuilder<List<double>>),
      );
      expect(
        animated.duration,
        reducedMotion ? Duration.zero : const Duration(milliseconds: 90),
      );
      expect(find.byIcon(Icons.hearing_rounded), findsNothing);
      expect(find.byIcon(Icons.graphic_eq_rounded), findsNothing);
      expect(
        find.byKey(const ValueKey('assistant-playback-spectrum')),
        findsOneWidget,
      );
      await tester.pumpWidget(app(active: false, energy: double.nan));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(tester.binding.hasScheduledFrame, isFalse);
    });
  }
}
