import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/view/app_appearance.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class _PlatformTextScaler extends TextScaler {
  const _PlatformTextScaler();

  @override
  double scale(double fontSize) => fontSize * (fontSize <= 16 ? 1.5 : 1.25);

  @override
  double get textScaleFactor => 1.5;
}

Widget _app(AppearanceSettings appearance, SorbetTheme? sorbet) =>
    shad.ShadcnApp(
      theme: AppearanceTheme.shadThemeFor(appearance, sorbet, Brightness.light),
      themeMode: shad.ThemeMode.light,
      enableThemeAnimation: false,
      home: const Text('Text probe'),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          textScaler: const _PlatformTextScaler(),
        ),
        child: AppAppearanceHost(
          appearance: appearance,
          sorbet: sorbet,
          child: ShadcnMaterialBridge(child: child!),
        ),
      ),
    );

void main() {
  for (final sorbet in [null, const SorbetTheme()]) {
    final design = sorbet == null ? 'Classic' : 'Sorbet';
    testWidgets('applies text appearance inside the $design app builder', (
      tester,
    ) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = const Size(390, 844);
      addTearDown(tester.view.reset);
      const defaults = AppearanceSettings();
      await tester.pumpWidget(_app(defaults, sorbet));
      await tester.pumpAndSettle();
      final probe = find.text('Text probe');
      final initial = tester.element(probe);
      final initialFamily = sorbet == null ? 'NotoSans' : 'Nunito';
      expect(MediaQuery.textScalerOf(initial).scale(16), 24);
      expect(AppTokens.of(initial).typography.fontFamily, initialFamily);
      expect(shad.Theme.of(initial).typography.base.fontFamily, initialFamily);
      final defaultSize = Theme.of(initial).textTheme.bodyMedium?.fontSize;

      final changed = defaults.copyWith(
        textFont: AppTextFont.jetBrainsMono,
        textScale: 1.2,
      );
      await tester.pumpWidget(_app(changed, sorbet));
      await tester.pumpAndSettle();
      final context = tester.element(probe);
      expect(context, same(initial));
      final scaler = MediaQuery.textScalerOf(context);
      expect(scaler.scale(16), closeTo(28.8, 0.001));
      expect(scaler.scale(24), closeTo(36, 0.001));
      final body = Theme.of(context).textTheme.bodyMedium;
      expect(body?.fontFamily, 'JetBrainsMono');
      expect(body?.fontSize, defaultSize);
      expect(AppTokens.of(context).typography.fontFamily, 'JetBrainsMono');
      expect(shad.Theme.of(context).typography.base.fontFamily, 'JetBrainsMono');

      tester.view.physicalSize = const Size(1440, 900);
      await tester.pumpAndSettle();
      final desktop = tester.element(probe);
      expect(desktop, same(initial));
      expect(MediaQuery.textScalerOf(desktop).scale(16), 32);
      expect(MediaQuery.textScalerOf(desktop).scale(24), closeTo(40.32, 0.001));
      expect(AppTokens.of(desktop).typography.fontFamily, 'JetBrainsMono');

      tester.view.physicalSize = const Size(390, 844);
      await tester.pumpWidget(
        _app(defaults.copyWith(textFont: AppTextFont.system), sorbet),
      );
      await tester.pumpAndSettle();
      final systemContext = tester.element(probe);
      expect(MediaQuery.textScalerOf(systemContext).scale(16), 24);
      expect(AppTokens.of(systemContext).typography.fontFamily, isNull);
      expect(shad.Theme.of(systemContext).typography.base.fontFamily, isNull);
      expect(
        Theme.of(systemContext).textTheme.bodyMedium?.fontFamily,
        isNot(anyOf('JetBrainsMono', 'Nunito', 'NotoSans')),
      );
    });
  }
}
