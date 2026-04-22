import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';

void main() {
  group('AssistantChromeCubit', () {
    test('enterLiveMode enables live mode and fullscreen', () {
      final cubit = AssistantChromeCubit()..enterLiveMode();

      expect(cubit.state.isLiveMode, isTrue);
      expect(cubit.state.isFullscreen, isTrue);
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
