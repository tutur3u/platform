import 'dart:io';

import 'package:integration_test/integration_test_driver_extended.dart';

/// Host-side driver for `flutter drive`. Writes each `takeScreenshot` capture
/// to `E2E_SHOTS_DIR` (default `build/e2e-shots`).
Future<void> main() {
  final directory = Directory(
    Platform.environment['E2E_SHOTS_DIR'] ?? 'build/e2e-shots',
  )..createSync(recursive: true);
  return integrationDriver(
    onScreenshot: (name, bytes, [args]) async {
      File('${directory.path}/$name.png').writeAsBytesSync(bytes);
      return true;
    },
  );
}
