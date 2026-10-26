part of 'settings_compact_navigation_test.dart';

Future<void> _loadSettingsRenderFonts() async {
  // Real proportional glyphs for the Material default family, so text
  // geometry (wrapping, trailing values) matches devices instead of Ahem.
  final materialFont = Platform.environment['SETTINGS_MATERIAL_FONT'];
  await (FontLoader('Roboto')..addFont(
        materialFont == null
            ? rootBundle.load('assets/fonts/NotoSans.ttf')
            : File(materialFont).readAsBytes().then(ByteData.sublistView),
      ))
      .load();
  for (final font in {
    'NotoSans': 'assets/fonts/NotoSans.ttf',
    'MaterialIcons': 'fonts/MaterialIcons-Regular.otf',
    'packages/shadcn_flutter/LucideIcons':
        'packages/shadcn_flutter/lib/icons/LucideIcons.ttf',
    'LucideIcons': 'assets/fonts/lucide/LucideIcons.otf',
  }.entries) {
    await (FontLoader(font.key)..addFont(rootBundle.load(font.value))).load();
  }
}
