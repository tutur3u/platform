import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';

void main() {
  group('AssistantChromeCubit', () {
    test('navigation switches between dock controls and tabs in Live', () {
      final cubit = AssistantChromeCubit();
      addTearDown(cubit.close);
      cubit.toggleComposerNavigation();
      expect(cubit.state.navigationExpanded, isFalse);
      cubit
        ..enterLiveMode()
        ..toggleComposerNavigation();
      expect(cubit.state.navigationExpanded, isTrue);
      cubit.exitLiveMode();
      expect(cubit.state.navigationExpanded, isFalse);
    });
    test('enterLiveMode keeps the shared navigation visible', () {
      final cubit = AssistantChromeCubit()..enterLiveMode();

      expect(cubit.state.isLiveMode, isTrue);
      expect(cubit.state.isFullscreen, isFalse);
    });

    test('exitLiveMode clears live mode and fullscreen', () {
      final cubit = AssistantChromeCubit()
        ..enterLiveMode()
        ..exitLiveMode();

      expect(cubit.state.isLiveMode, isFalse);
      expect(cubit.state.isFullscreen, isFalse);
    });
  });
}
