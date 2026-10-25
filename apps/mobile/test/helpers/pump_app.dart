import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/widgets/shadcn_localizations_fallback.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

extension PumpApp on WidgetTester {
  Future<void> pumpApp(Widget widget, {ThemeMode? themeMode}) {
    final router = GoRouter(
      initialLocation: '/test',
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) => const SizedBox.shrink(),
        ),
        GoRoute(
          path: '/test',
          builder: (context, state) => shad.DrawerOverlay(child: widget),
        ),
      ],
    );
    addTearDown(router.dispose);

    return pumpWidget(
      shad.ShadcnApp.router(
        debugShowCheckedModeBanner: false,
        themeMode: switch (themeMode) {
          ThemeMode.light => shad.ThemeMode.light,
          ThemeMode.dark => shad.ThemeMode.dark,
          ThemeMode.system || null => shad.ThemeMode.system,
        },
        theme: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
        darkTheme: const shad.ThemeData.dark(
          colorScheme: shad.ColorSchemes.darkZinc,
        ),
        localizationsDelegates: const [
          ...AppLocalizations.localizationsDelegates,
          AppShadcnLocalizationsDelegate(),
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        routerConfig: router,
        builder: ShadcnMaterialBridge.appBuilder,
      ),
    );
  }

  /// Pumps the app shell around [router]; [wrap] adds providers above it.
  Future<void> pumpAppRouter(
    GoRouter router, {
    Widget Function(Widget app)? wrap,
  }) {
    final app = shad.ShadcnApp.router(
      debugShowCheckedModeBanner: false,
      theme: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
      localizationsDelegates: const [
        ...AppLocalizations.localizationsDelegates,
        AppShadcnLocalizationsDelegate(),
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: router,
      builder: ShadcnMaterialBridge.appBuilder,
    );
    return pumpWidget(wrap == null ? app : wrap(app));
  }

  /// Pumps [home] in the default appearance theme for [brightness];
  /// [wrap] adds providers above the app.
  Future<void> pumpThemedHome(
    Widget home, {
    Brightness brightness = Brightness.light,
    Widget Function(Widget app)? wrap,
  }) {
    final app = shad.ShadcnApp(
      debugShowCheckedModeBanner: false,
      theme: AppearanceTheme.shadTheme(const AppearanceSettings(), brightness),
      localizationsDelegates: const [
        ...AppLocalizations.localizationsDelegates,
        AppShadcnLocalizationsDelegate(),
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      builder: ShadcnMaterialBridge.appBuilder,
      home: home,
    );
    return pumpWidget(wrap == null ? app : wrap(app));
  }

  Future<void> drainShadToastTimers() async {
    await pump(const Duration(seconds: 6));
    await pump(const Duration(milliseconds: 50));
  }
}

/// Real appearance/router boundary shared by shell regression fixtures.
Widget shellTestApp({
  required GoRouter router,
  Brightness brightness = Brightness.light,
}) => shad.ShadcnApp.router(
  debugShowCheckedModeBanner: false,
  theme: AppearanceTheme.shadTheme(const AppearanceSettings(), brightness),
  localizationsDelegates: const [
    ...AppLocalizations.localizationsDelegates,
    AppShadcnLocalizationsDelegate(),
  ],
  supportedLocales: AppLocalizations.supportedLocales,
  routerConfig: router,
  builder: (context, child) => AppearanceBackdrop(
    settings: const AppearanceSettings(),
    child: ShadcnMaterialBridge(child: child!),
  ),
);
