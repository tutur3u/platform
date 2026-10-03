import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';

void main() {
  group('AssistantChromeCubit', () {
    test(
      'opening collapses navigation and closing restores default chrome',
      () {
        final cubit = AssistantChromeCubit();
        addTearDown(cubit.close);
        cubit.setComposerVisible(visible: true);
        expect(cubit.state.composerVisible, isTrue);
        expect(cubit.state.navigationExpanded, isFalse);
        cubit.toggleComposerNavigation();
        expect(cubit.state.navigationExpanded, isTrue);
        cubit.setComposerVisible(visible: true);
        expect(cubit.state.navigationExpanded, isTrue);
        cubit.setComposerVisible(visible: false);
        expect(cubit.state.composerVisible, isFalse);
        expect(cubit.state.navigationExpanded, isFalse);
        cubit.toggleComposerNavigation();
        expect(cubit.state.navigationExpanded, isFalse);
      },
    );
    test(
      'entering live resets composer without changing session transport',
      () {
        final cubit = AssistantChromeCubit()
          ..setComposerVisible(visible: true)
          ..toggleComposerNavigation()
          ..enterLiveMode();
        addTearDown(cubit.close);
        expect(cubit.state.composerVisible, isFalse);
        expect(cubit.state.navigationExpanded, isFalse);
        expect(cubit.state.isLiveMode, isTrue);
      },
    );
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
