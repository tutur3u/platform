import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/ambient_background.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/ui/tokens/app_color_tokens.dart';
import 'package:mobile/l10n/l10n.dart';

/// Design review renders: phone, tablet and desktop sizes in light, dark and
/// a blob appearance. PNGs are written only when `DESIGN_RENDER_DIR` is set;
/// `DESIGN_RENDER_PIXEL_RATIO` scales them (default 1).
abstract final class DesignRender {
  static final String? outputDir = Platform.environment['DESIGN_RENDER_DIR'];

  static const sizes = {
    'phone': Size(390, 844),
    'tablet': Size(820, 1180),
    'desktop': Size(1440, 900),
  };

  static const Map<String, (AppearanceSettings, Brightness)> themes = {
    'light': (AppearanceSettings(), Brightness.light),
    'dark': (AppearanceSettings(), Brightness.dark),
    'aurora-blobs': (
      AppearanceSettings(
        theme: AppearanceThemeId.aurora,
        backgroundStyle: AppearanceBackgroundStyle.blobs,
      ),
      Brightness.light,
    ),
  };

  /// Loads real glyphs so renders show text and icons instead of boxes.
  static Future<void> loadFonts() async {
    if (outputDir == null) return;
    await (FontLoader(
      'Roboto',
    )..addFont(rootBundle.load('assets/fonts/NotoSans.ttf'))).load();
    for (final font in {
      'NotoSans': 'assets/fonts/NotoSans.ttf',
      'MaterialIcons': 'fonts/MaterialIcons-Regular.otf',
      'LucideIcons': 'assets/fonts/lucide/LucideIcons.otf',
    }.entries) {
      await (FontLoader(font.key)..addFont(rootBundle.load(font.value))).load();
    }
  }

  /// Sizes the test view; resets it when the test ends.
  static void setSize(WidgetTester tester, Size size) {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = size;
    addTearDown(tester.view.reset);
  }

  /// Writes the [DesignRenderApp] boundary to `<DESIGN_RENDER_DIR>/<name>.png`.
  static Future<void> capture(WidgetTester tester, String name) async {
    final output = outputDir;
    if (output == null) return;
    final ratio =
        double.tryParse(
          Platform.environment['DESIGN_RENDER_PIXEL_RATIO'] ?? '',
        ) ??
        1;
    await tester.runAsync(() async {
      final boundary = tester.renderObject<RenderRepaintBoundary>(
        find.byKey(DesignRenderApp.boundaryKey),
      );
      final image = await boundary.toImage(pixelRatio: ratio);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      await Directory(output).create(recursive: true);
      await File('$output/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
      image.dispose();
    });
  }
}

/// App frame for design renders: the appearance theme's Material theme
/// (with its colour tokens) over the ambient background, as the shell paints
/// it. Uses no shadcn widgets, so feature renders exercise core/ui alone.
class DesignRenderApp extends StatelessWidget {
  const DesignRenderApp({
    required this.settings,
    required this.brightness,
    required this.child,
    super.key,
  });

  static const ValueKey<String> boundaryKey = ValueKey('design-render');

  final AppearanceSettings settings;
  final Brightness brightness;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = AppearanceTheme.materialTheme(settings, brightness);
    final page =
        (theme.extension<AppColorTokens>() ??
                AppColorTokens.fallback(brightness))
            .background;
    return RepaintBoundary(
      key: boundaryKey,
      child: MaterialApp(
        theme: theme,
        debugShowCheckedModeBanner: false,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Stack(
          fit: StackFit.expand,
          children: [
            ColoredBox(color: page),
            if (settings.hasAmbientBackground)
              AmbientBackground(settings: settings, brightness: brightness),
            Material(type: MaterialType.transparency, child: child),
          ],
        ),
      ),
    );
  }
}
