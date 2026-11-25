import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_action_bar.dart';

void main() {
  tearDown(() => debugDefaultTargetPlatformOverride = null);

  for (final platform in [
    TargetPlatform.macOS,
    TargetPlatform.windows,
    TargetPlatform.linux,
  ]) {
    test('${platform.name} binds every Mail key', () {
      debugDefaultTargetPlatformOverride = platform;
      for (final key in [
        LogicalKeyboardKey.keyJ,
        LogicalKeyboardKey.keyE,
        LogicalKeyboardKey.escape,
      ]) {
        expect(mailKeyboardBinds(key, modified: false), isTrue);
      }
    });
  }

  for (final platform in [
    TargetPlatform.android,
    TargetPlatform.iOS,
    TargetPlatform.fuchsia,
  ]) {
    test('${platform.name} binds only a bare Escape', () {
      debugDefaultTargetPlatformOverride = platform;
      expect(
        mailKeyboardBinds(LogicalKeyboardKey.escape, modified: false),
        isTrue,
      );
      expect(
        mailKeyboardBinds(LogicalKeyboardKey.escape, modified: true),
        isFalse,
      );
      for (final key in [
        LogicalKeyboardKey.keyJ,
        LogicalKeyboardKey.keyE,
        LogicalKeyboardKey.slash,
        LogicalKeyboardKey.enter,
      ]) {
        expect(mailKeyboardBinds(key, modified: false), isFalse);
      }
    });
  }
}
