import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/widgets/shadcn_localizations_fallback.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/floating_dock_rail.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

const ValueKey<String> _sendKey = ValueKey('send-reference');

// Stand-in for the shell navigation pill; only the primary slot is under test.
class _NavigationPill extends StatelessWidget {
  const _NavigationPill();
  @override
  Widget build(BuildContext context) => ShellDockSurface(
    child: Padding(
      padding: const EdgeInsets.all(2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final icon in [
            LucideIcons.house,
            LucideIcons.layoutGrid,
            LucideIcons.sparkles,
            LucideIcons.bell,
            LucideIcons.user,
          ])
            SizedBox.square(dimension: 48, child: Icon(icon, size: 22)),
        ],
      ),
    ),
  );
}

Widget _scene(AppearanceSettings settings, Brightness brightness) =>
    shad.ShadcnApp(
      debugShowCheckedModeBanner: false,
      theme: AppearanceTheme.shadTheme(settings, brightness),
      localizationsDelegates: const [
        ...AppLocalizations.localizationsDelegates,
        AppShadcnLocalizationsDelegate(),
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      builder: (context, child) => AppearanceBackdrop(
        settings: settings,
        child: ShadcnMaterialBridge(child: child!),
      ),
      home: Align(
        alignment: Alignment.bottomCenter,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 34),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              // The composer's send action occupies the same dock slot.
              FloatingDockRail(
                navigation: const _NavigationPill(),
                primary: ShellDockActionButton(
                  key: _sendKey,
                  action: ShellActionSpec(
                    id: 'send',
                    icon: LucideIcons.arrowUp,
                    tooltip: 'Send',
                    onPressed: () {},
                  ),
                ),
              ),
              const SizedBox(height: 16),
              FloatingDockRail(
                navigation: const _NavigationPill(),
                primary: AssistantComposerFab(label: 'Chat', onPressed: () {}),
              ),
            ],
          ),
        ),
      ),
    );

Material _surface(WidgetTester tester, Finder owner) => tester.widget<Material>(
  find.descendant(of: owner, matching: find.byType(Material)).first,
);

void main() {
  setUpAll(() async {
    for (final font in {
      'Roboto': 'assets/fonts/NotoSans.ttf',
      'NotoSans': 'assets/fonts/NotoSans.ttf',
      'MaterialIcons': 'fonts/MaterialIcons-Regular.otf',
      'LucideIcons': 'assets/fonts/lucide/LucideIcons.otf',
    }.entries) {
      try {
        await (FontLoader(
          font.key,
        )..addFont(rootBundle.load(font.value))).load();
      } on Object {
        // Raster fidelity only; shape assertions do not depend on fonts.
      }
    }
  });

  final raster = Platform.environment['ASSISTANT_DOCK_RASTER_DIR'];
  for (final brightness in Brightness.values) {
    for (final style in AppearanceBackgroundStyle.values) {
      for (final accent in [
        AppearanceAccentId.theme,
        AppearanceAccentId.violet,
      ]) {
        final settings = AppearanceSettings(
          theme: style == AppearanceBackgroundStyle.solid
              ? AppearanceThemeId.classic
              : AppearanceThemeId.aurora,
          accent: accent,
          backgroundStyle: style,
        );
        final name = '${brightness.name}-${style.name}-${accent.name}';
        testWidgets('dock chat action matches the circular send action: '
            '$name', (tester) async {
          tester.view.devicePixelRatio = 3;
          tester.view.physicalSize = const Size(390 * 3, 844 * 3);
          addTearDown(tester.view.resetDevicePixelRatio);
          addTearDown(tester.view.resetPhysicalSize);
          await tester.pumpWidget(_scene(settings, brightness));
          await tester.pump(const Duration(milliseconds: 400));

          final fab = find.byType(AssistantComposerFab);
          final send = find.byKey(_sendKey);
          final fabSize = tester.getSize(fab);
          expect(fabSize.width, fabSize.height);
          expect(fabSize.shortestSide, greaterThanOrEqualTo(44));
          expect(tester.getSize(send), fabSize);
          final fabSurface = _surface(tester, fab);
          final sendSurface = _surface(tester, send);
          expect(fabSurface.shape, isA<StadiumBorder>());
          expect(fabSurface.shape, sendSurface.shape);
          expect(fabSurface.color, sendSurface.color);

          if (raster != null) {
            await tester.runAsync(() async {
              final view = tester.binding.renderViews.first;
              final scene = view.debugLayer!.buildScene(ui.SceneBuilder());
              final image = await scene.toImage(
                tester.view.physicalSize.width.toInt(),
                tester.view.physicalSize.height.toInt(),
              );
              scene.dispose();
              final bytes = await image.toByteData(
                format: ui.ImageByteFormat.png,
              );
              await File(
                '$raster/dock-$name.png',
              ).writeAsBytes(bytes!.buffer.asUint8List());
              image.dispose();
            });
          }
        });
      }
    }
  }
}
