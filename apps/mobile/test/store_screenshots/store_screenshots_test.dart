// Raw store screenshot capture: the real feature pages over synthetic fixture
// data, at every store device size, in English and Vietnamese.
//
//   DESIGN_RENDER_DIR=build/store_raw flutter test \
//     test/store_screenshots/store_screenshots_test.dart
//
// Optional comma-separated filters: STORE_SCREENS (ids), STORE_DEVICES
// (`ios/iphone-6.9`), STORE_LOCALES (`en`, `vi`). Without DESIGN_RENDER_DIR
// the suite still pumps every page as a smoke test and writes nothing.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../helpers/design_render_harness.dart';
import 'fixtures/finance_fixture.dart';
import 'screens/store_screens.dart';
import 'store_screenshot_app.dart';

Set<String>? _filter(String name) {
  final value = Platform.environment[name]?.trim();
  if (value == null || value.isEmpty) return null;
  return value.split(',').map((part) => part.trim()).toSet();
}

void main() {
  final screens = _filter('STORE_SCREENS');
  final devices = _filter('STORE_DEVICES');
  final locales = _filter('STORE_LOCALES');
  // Smoke runs (no output dir) pump one phone and one desktop size.
  const smokeDevices = {'ios/iphone-6.9', 'macos/mac'};

  setUpAll(() async {
    await DesignRender.loadFonts();
    await initStoreCache();
  });

  for (final device in storeDevices) {
    if (devices != null && !devices.contains(device.id)) continue;
    if (devices == null &&
        DesignRender.outputDir == null &&
        !smokeDevices.contains(device.id)) {
      continue;
    }
    for (final locale in StoreLocale.values) {
      if (locales != null && !locales.contains(locale.name)) continue;
      for (final screen in storeScreens) {
        if (screens != null && !screens.contains(screen.id)) continue;
        testWidgets('${device.id} ${locale.name} ${screen.id}', (tester) async {
          await captureStoreScreen(tester, screen, device, locale);
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
}
