import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_font_licenses.dart';

void main() {
  test('every Sorbet font licence asset exists and is declared', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    for (final asset in sorbetFontLicenseAssets.values) {
      expect(File(asset).existsSync(), isTrue, reason: asset);
      expect(pubspec, contains('- $asset'), reason: asset);
    }
  });

  testWidgets('registers the notices on the licence page', (tester) async {
    TestWidgetsFlutterBinding.ensureInitialized();
    registerSorbetFontLicenses();
    final packages = <String>{};
    await tester.runAsync(() async {
      await for (final entry in LicenseRegistry.licenses) {
        packages.addAll(entry.packages);
      }
    });
    expect(packages, containsAll(sorbetFontLicenseAssets.keys));
  });
}
