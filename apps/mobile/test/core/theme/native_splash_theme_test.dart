import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/mobile_shad_theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('native dark splash pixels match the actual app background', () async {
    final expected = MobileShadTheme.dark.colorScheme.background;
    for (final path in [
      'android/app/src/main/res/drawable-night/background.png',
      'android/app/src/main/res/drawable-night-v21/background.png',
      'ios/Runner/Assets.xcassets/LaunchBackground.imageset/darkbackground.png',
    ]) {
      final codec = await ui.instantiateImageCodec(
        File(path).readAsBytesSync(),
      );
      final frame = await codec.getNextFrame();
      final data = (await frame.image.toByteData())!;
      expect(data.getUint8(0), (expected.r * 255).round(), reason: path);
      expect(data.getUint8(1), (expected.g * 255).round(), reason: path);
      expect(data.getUint8(2), (expected.b * 255).round(), reason: path);
      expect(data.getUint8(3), 255, reason: path);
      frame.image.dispose();
      codec.dispose();
    }
    final hex =
        '#${expected.toARGB32().toRadixString(16).substring(2).toUpperCase()}';
    expect(
      File('flutter_native_splash.yaml').readAsStringSync(),
      contains(hex),
    );
    for (final path in [
      'android/app/src/main/res/values-night/colors.xml',
      'android/app/src/main/res/values-night-v31/styles.xml',
    ]) {
      expect(File(path).readAsStringSync().toUpperCase(), contains(hex));
    }
  });
}
