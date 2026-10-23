import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/ambient_background.dart';
import 'package:mobile/core/theme/appearance/appearance_palettes.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_state.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

/// Mirrors `App`: the theme cubit drives the shad themes and the backdrop.
Widget _app(ThemeCubit cubit, Widget home) => BlocProvider.value(
  value: cubit,
  child: BlocBuilder<ThemeCubit, ThemeState>(
    builder: (context, state) => shad.ShadcnApp(
      theme: AppearanceTheme.shadTheme(state.appearance, Brightness.light),
      darkTheme: AppearanceTheme.shadTheme(state.appearance, Brightness.dark),
      themeMode: state.themeMode,
      enableThemeAnimation: false,
      home: home,
      builder: (context, child) => AppearanceBackdrop(
        settings: state.appearance,
        child: ShadcnMaterialBridge.appBuilder(context, child),
      ),
    ),
  ),
);

class _Probe extends StatefulWidget {
  const _Probe();

  @override
  State<_Probe> createState() => _ProbeState();
}

class _ProbeState extends State<_Probe> {
  @override
  Widget build(BuildContext context) => shad.Scaffold(
    child: Builder(
      builder: (context) => Text(
        'probe',
        key: ValueKey(shad.Theme.of(context).colorScheme.primary),
      ),
    ),
  );
}

Future<ui.Image> _paint(AppearanceSettings settings, Brightness b) {
  final recorder = ui.PictureRecorder();
  AmbientPainter(
    settings: settings,
    brightness: b,
  ).paint(Canvas(recorder), const Size(120, 200));
  return recorder.endRecording().toImage(120, 200);
}

Future<Color> _pixel(ui.Image image, int x, int y) async {
  final bytes = (await image.toByteData())!;
  final i = (y * image.width + x) * 4;
  return Color.fromARGB(
    bytes.getUint8(i + 3),
    bytes.getUint8(i),
    bytes.getUint8(i + 1),
    bytes.getUint8(i + 2),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('appearance changes apply app-wide without remounting routes', (
    tester,
  ) async {
    final cubit = ThemeCubit(
      settingsRepository: SettingsRepository(),
      initialThemeMode: shad.ThemeMode.dark,
    );
    addTearDown(cubit.close);
    await tester.pumpWidget(_app(cubit, const _Probe()));
    final state = tester.state(find.byType(_Probe));
    expect(find.byType(AmbientBackground), findsNothing);
    expect(
      find.byKey(ValueKey(shad.ColorSchemes.darkZinc.primary)),
      findsOneWidget,
    );

    const aurora = AppearanceSettings(
      theme: AppearanceThemeId.aurora,
      backgroundStyle: AppearanceBackgroundStyle.blobs,
    );
    await cubit.setAppearance(aurora);
    await tester.pumpAndSettle();
    expect(tester.state(find.byType(_Probe)), same(state));
    expect(find.byType(AmbientBackground), findsOneWidget);
    expect(
      find.byKey(
        ValueKey(AppearancePalettes.accentColor(aurora, Brightness.dark)),
      ),
      findsOneWidget,
    );
    final materialTheme = Theme.of(tester.element(find.text('probe')));
    expect(materialTheme.scaffoldBackgroundColor.a, 0);

    await cubit.resetAppearance();
    await tester.pumpAndSettle();
    expect(tester.state(find.byType(_Probe)), same(state));
    expect(find.byType(AmbientBackground), findsNothing);
  });

  testWidgets('pushed pages carry the ambient layer beneath their content', (
    tester,
  ) async {
    final cubit = ThemeCubit(
      settingsRepository: SettingsRepository(),
      initialAppearance: const AppearanceSettings(
        theme: AppearanceThemeId.ocean,
        backgroundStyle: AppearanceBackgroundStyle.gradient,
      ),
    );
    addTearDown(cubit.close);
    await tester.pumpWidget(
      _app(
        cubit,
        Builder(
          builder: (context) => shad.Scaffold(
            child: TextButton(
              onPressed: () => Navigator.of(
                context,
              ).push(MaterialPageRoute<void>(builder: (_) => const _Probe())),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    );
    expect(find.byType(AmbientBackground), findsOneWidget);
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(
      find.ancestor(
        of: find.byType(_Probe),
        matching: find.byType(AppearanceRouteBackground),
      ),
      findsOneWidget,
    );
    expect(find.byType(AmbientBackground), findsNWidgets(2));
  });

  test('solid paints only the base; gradient and blobs tint it', () async {
    for (final b in Brightness.values) {
      final base = AppearancePalettes.sunset.tones(b).base;
      final solid = await _paint(
        const AppearanceSettings(theme: AppearanceThemeId.sunset),
        b,
      );
      expect(await _pixel(solid, 60, 100), base);

      final gradient = await _paint(
        const AppearanceSettings(
          theme: AppearanceThemeId.sunset,
          backgroundStyle: AppearanceBackgroundStyle.gradient,
          intensity: 1,
        ),
        b,
      );
      final corner = await _pixel(gradient, 0, 0);
      final stop = AppearancePalettes.sunset.tones(b).gradient.first;
      expect(
        (corner.r - stop.r).abs() + (corner.g - stop.g).abs(),
        lessThan(0.05),
      );
      final blobs = await _paint(
        const AppearanceSettings(
          theme: AppearanceThemeId.sunset,
          backgroundStyle: AppearanceBackgroundStyle.blobs,
        ),
        b,
      );
      expect(await _pixel(blobs, 14, 16), isNot(base));
      expect(await _pixel(blobs, 14, 16), isNot(await _pixel(blobs, 110, 190)));
    }
  });

  testWidgets('gradient and blob themes render without frame churn', (
    tester,
  ) async {
    for (final sample in [
      (
        'sunset-gradient',
        AppearanceBackgroundStyle.gradient,
        AppearanceThemeId.sunset,
      ),
      (
        'aurora-blobs',
        AppearanceBackgroundStyle.blobs,
        AppearanceThemeId.aurora,
      ),
    ]) {
      final settings = AppearanceSettings(
        theme: sample.$3,
        backgroundStyle: sample.$2,
        animate: true,
      );
      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(disableAnimations: true),
          child: Directionality(
            textDirection: TextDirection.ltr,
            child: shad.Theme(
              data: AppearanceTheme.shadTheme(settings, Brightness.dark),
              child: AppearanceBackdrop(
                settings: settings,
                child: const RepaintBoundary(
                  key: ValueKey('render'),
                  child: SizedBox.expand(),
                ),
              ),
            ),
          ),
        ),
      );
      // Reduced motion keeps animated blobs static: no scheduled frames.
      expect(tester.binding.hasScheduledFrame, isFalse);
      expect(
        tester.widget<AmbientBackground>(find.byType(AmbientBackground)).motion,
        isNull,
      );
      final output = Platform.environment['SETTINGS_RENDER_DIR'];
      if (output != null) {
        await tester.runAsync(() async {
          final boundary = tester.renderObject<RenderRepaintBoundary>(
            find.byType(RepaintBoundary).first,
          );
          final image = await boundary.toImage();
          final png = await image.toByteData(format: ui.ImageByteFormat.png);
          await Directory(output).create(recursive: true);
          await File(
            '$output/ambient-${sample.$1}-dark.png',
          ).writeAsBytes(png!.buffer.asUint8List());
          image.dispose();
        });
      }
    }
  });
}
