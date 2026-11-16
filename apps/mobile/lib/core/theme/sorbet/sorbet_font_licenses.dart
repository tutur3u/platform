import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Bundled SIL Open Font License notices of the Sorbet typefaces.
const sorbetFontLicenseAssets = {
  'Nunito': 'assets/fonts/Nunito-OFL.txt',
  'JetBrains Mono': 'assets/fonts/JetBrainsMono-OFL.txt',
};

/// Adds the Nunito and JetBrains Mono notices to the app's licence page.
void registerSorbetFontLicenses({AssetBundle? bundle}) {
  LicenseRegistry.addLicense(() async* {
    final source = bundle ?? rootBundle;
    for (final MapEntry(key: package, value: asset)
        in sorbetFontLicenseAssets.entries) {
      yield LicenseEntryWithLineBreaks([
        package,
      ], await source.loadString(asset));
    }
  });
}
