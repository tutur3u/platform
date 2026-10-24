import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Bundled licence notices of the generated Lucide icon fonts.
const lucideLicenseAssets = {
  'Lucide': 'assets/fonts/lucide/LICENSE-lucide.txt',
  'Lucide Lab': 'assets/fonts/lucide/LICENSE-lucide-lab.txt',
};

/// Adds the Lucide and Lucide Lab ISC notices to the app's licence page.
void registerLucideLicenses({AssetBundle? bundle}) {
  LicenseRegistry.addLicense(() async* {
    final source = bundle ?? rootBundle;
    for (final MapEntry(key: package, value: asset)
        in lucideLicenseAssets.entries) {
      yield LicenseEntryWithLineBreaks([
        package,
      ], await source.loadString(asset));
    }
  });
}
