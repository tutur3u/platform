import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/theme/sorbet/sorbet_scope.dart';
import 'package:mobile/core/widgets/shadcn_localizations_fallback.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import 'package:shared_preferences/shared_preferences.dart';

import '../helpers/design_render_harness.dart';
import 'capture_guard.dart';
import 'fixtures/shell_frame_fixture.dart';

/// Store listing locales. Fixture content ships in both.
enum StoreLocale {
  en,
  vi;

  Locale get locale => Locale(name);

  /// Picks the [en] or [vi] variant of a fixture string and records the pair
  /// for [expectCleanStoreCapture].
  T pick<T>(T en, T vi) {
    if (en is String && vi is String && en != vi) {
      storeFixtureStringPairs.add((en, vi));
    }
    return this == StoreLocale.en ? en : vi;
  }
}

/// A store screenshot target: the logical viewport the app lays out in and
/// the pixel ratio that turns it into the store's raw pixel size.
class StoreDevice {
  const StoreDevice(this.id, this.logicalSize, this.pixelRatio);

  /// `<store>/<device>`, matching `apps/mobile/store/metadata/<store>.json`.
  final String id;
  final Size logicalSize;
  final double pixelRatio;

  Size get pixelSize => logicalSize * pixelRatio;
}

/// Every device the store listings ask for.
const storeDevices = <StoreDevice>[
  StoreDevice('ios/iphone-6.9', Size(440, 956), 3), // 1320x2868
  StoreDevice('ios/iphone-6.5', Size(428, 926), 3), // 1284x2778
  StoreDevice('ios/ipad-13', Size(1032, 1376), 2), // 2064x2752
  StoreDevice('android/phone', Size(432, 768), 2.5), // 1080x1920
  StoreDevice('android/tablet7', Size(600, 960), 2), // 1200x1920
  StoreDevice('android/tablet10', Size(800, 1280), 2), // 1600x2560
  StoreDevice('macos/mac', Size(1440, 900), 2), // 2880x1800
  StoreDevice('windows/desktop', Size(1440, 810), 4 / 3), // 1920x1080
];

/// One listing screen: the real feature page over synthetic fixture data.
class StoreScreen {
  const StoreScreen({
    required this.id,
    required this.order,
    required this.build,
    this.prepare,
    this.shellLocation,
  });

  /// Matches the metadata screenshot `id` (`dashboard`, `time-tracker`, ...).
  final String id;

  /// 1-based position in the listing (`01-dashboard`).
  final int order;

  /// The page and the providers it needs, seeded for [StoreLocale].
  final Widget Function(StoreLocale locale) build;

  /// Optional interaction after the first settle (switch a tab, scroll).
  final Future<void> Function(WidgetTester tester, StoreLocale locale)? prepare;

  /// When set, the page renders inside the app's real shell (header, dock or
  /// rail) at this route. Leave null when [build] already returns the shell.
  final String? shellLocation;

  String get fileName => '${order.toString().padLeft(2, '0')}-$id';
}

/// The app's own root frame (Shadcn app, appearance host, Material bridge) in
/// the default light classic theme a fresh install shows, inside the capture
/// boundary. Sorbet is opt-in, so no Sorbet theme is active.
class StoreScreenshotApp extends StatefulWidget {
  const StoreScreenshotApp({
    required this.locale,
    required this.child,
    super.key,
  });

  final StoreLocale locale;
  final Widget child;

  @override
  State<StoreScreenshotApp> createState() => _StoreScreenshotAppState();
}

class _StoreScreenshotAppState extends State<StoreScreenshotApp> {
  static const _appearance = AppearanceSettings();

  late final GoRouter _router = GoRouter(
    initialLocation: '/store',
    routes: [
      GoRoute(path: '/', builder: (context, state) => const SizedBox.shrink()),
      GoRoute(
        path: '/store',
        builder: (context, state) => shad.DrawerOverlay(child: widget.child),
      ),
    ],
  );

  @override
  void dispose() {
    _router.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      key: DesignRenderApp.boundaryKey,
      child: shad.ShadcnApp.router(
        debugShowCheckedModeBanner: false,
        theme: AppearanceTheme.shadThemeFor(
          _appearance,
          null,
          Brightness.light,
        ),
        darkTheme: AppearanceTheme.shadThemeFor(
          _appearance,
          null,
          Brightness.dark,
        ),
        themeMode: shad.ThemeMode.light,
        locale: widget.locale.locale,
        localizationsDelegates: const [
          ...AppLocalizations.localizationsDelegates,
          AppShadcnLocalizationsDelegate(),
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        routerConfig: _router,
        builder: (context, child) => SorbetAppearanceHost(
          appearance: _appearance,
          sorbet: null,
          child: ShadcnMaterialBridge(child: child ?? const SizedBox.shrink()),
        ),
      ),
    );
  }
}

/// Lays out [screen] on [device], settles it and writes
/// `<DESIGN_RENDER_DIR>/<device.id>/<locale>/<NN-id>.png`.
Future<void> captureStoreScreen(
  WidgetTester tester,
  StoreScreen screen,
  StoreDevice device,
  StoreLocale locale,
) async {
  DesignRender.setSize(tester, device.logicalSize);
  // Screens that need stored preferences seed their own in build().
  SharedPreferences.setMockInitialValues({});
  final page = screen.build(locale);
  final location = screen.shellLocation;
  await tester.pumpWidget(
    StoreScreenshotApp(
      key: ValueKey('${device.id}/${locale.name}/${screen.id}'),
      locale: locale,
      child: location == null
          ? page
          : storeShellFrame(location: location, child: page),
    ),
  );
  await settleStoreScreen(tester);
  await screen.prepare?.call(tester, locale);
  await settleStoreScreen(tester);
  await DesignRender.capture(
    tester,
    '${device.id}/${locale.name}/${screen.fileName}',
    pixelRatio: device.pixelRatio,
  );
  // After the write, so a rejected frame can still be inspected.
  expectCleanStoreCapture(tester, locale);
  // Unmount between captures so timers and streams from one page never leak
  // into the next.
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump(const Duration(seconds: 1));
}

/// Lets async fixture loads land, then settles animations without failing on
/// pages that keep a repeating animation (a running timer, a typing dot).
Future<void> settleStoreScreen(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.pump(const Duration(milliseconds: 200));
  }
  try {
    await tester.pumpAndSettle(
      const Duration(milliseconds: 100),
      EnginePhase.sendSemanticsUpdate,
      const Duration(seconds: 3),
    );
    // pumpAndSettle signals a timeout with a FlutterError.
    // ignore: avoid_catching_errors
  } on FlutterError {
    // A repeating animation never settles; the frame is already final.
  }
}
