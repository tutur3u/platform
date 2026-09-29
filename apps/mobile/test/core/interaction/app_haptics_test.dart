import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/interaction/app_haptics.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'selection feedback is throttled without suppressing other intents',
    () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      final calls = <String>[];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, (call) async {
            if (call.method == 'HapticFeedback.vibrate') {
              calls.add(call.arguments as String);
            }
            return null;
          });
      addTearDown(() {
        debugDefaultTargetPlatformOverride = null;
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(SystemChannels.platform, null);
      });

      await AppHaptics.selection();
      await AppHaptics.selection();
      await AppHaptics.pickup();
      expect(calls, [
        'HapticFeedbackType.selectionClick',
        'HapticFeedbackType.mediumImpact',
      ]);
    },
  );

  test('feedback can be disabled for user preference', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    AppHaptics.enabled = false;
    addTearDown(() {
      AppHaptics.enabled = true;
      debugDefaultTargetPlatformOverride = null;
    });
    await AppHaptics.warning();
  });
}
