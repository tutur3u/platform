import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/theme/sorbet/sorbet_scope.dart';
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

/// [home] inside a page scaffold with the real appearance themes and ambient
/// backdrop, so gradient and blob styles render as they do in the app.
Widget appearanceTestApp({
  required Widget home,
  AppearanceSettings appearance = const AppearanceSettings(),
  Brightness brightness = Brightness.light,
}) => shad.ShadcnApp(
  debugShowCheckedModeBanner: false,
  theme: AppearanceTheme.shadTheme(appearance, Brightness.light),
  darkTheme: AppearanceTheme.shadTheme(appearance, Brightness.dark),
  themeMode: brightness == Brightness.dark
      ? shad.ThemeMode.dark
      : shad.ThemeMode.light,
  enableThemeAnimation: false,
  localizationsDelegates: const [
    ...AppLocalizations.localizationsDelegates,
    AppShadcnLocalizationsDelegate(),
  ],
  supportedLocales: AppLocalizations.supportedLocales,
  builder: (context, child) => AppearanceBackdrop(
    settings: appearance,
    child: ShadcnMaterialBridge.appBuilder(context, child),
  ),
  home: shad.Scaffold(child: home),
);

/// [home] through the app's theme pipeline: the classic or [sorbet] shad
/// theme, the appearance host and the Material bridge, with animations off.
/// [boundaryKey] marks a repaint boundary around the app for goldens.
Widget sorbetTestApp({
  required Widget home,
  AppearanceSettings appearance = const AppearanceSettings(),
  SorbetTheme? sorbet,
  Brightness brightness = Brightness.light,
  Key? boundaryKey,
}) => shad.ShadcnApp(
  debugShowCheckedModeBanner: false,
  theme: AppearanceTheme.shadThemeFor(appearance, sorbet, Brightness.light),
  darkTheme: AppearanceTheme.shadThemeFor(appearance, sorbet, Brightness.dark),
  themeMode: brightness == Brightness.dark
      ? shad.ThemeMode.dark
      : shad.ThemeMode.light,
  enableThemeAnimation: false,
  localizationsDelegates: const [
    ...AppLocalizations.localizationsDelegates,
    AppShadcnLocalizationsDelegate(),
  ],
  supportedLocales: AppLocalizations.supportedLocales,
  builder: (context, child) => RepaintBoundary(
    key: boundaryKey,
    child: MediaQuery(
      data: MediaQuery.of(context).copyWith(disableAnimations: true),
      child: SorbetAppearanceHost(
        appearance: appearance,
        sorbet: sorbet,
        child: ShadcnMaterialBridge.appBuilder(context, child),
      ),
    ),
  ),
  home: home,
);

/// A routed page under the app's light theme pipeline in a fixed [locale]:
/// the [sorbet] or classic shad theme, the appearance host and the Material
/// bridge. Routes wrap their page in [routedTestPage] for drawer and sheet
/// hosting. Store screenshots render through this root.
Widget routedSorbetTestApp({
  required GoRouter router,
  required Locale locale,
  AppearanceSettings appearance = const AppearanceSettings(),
  SorbetTheme? sorbet,
  Brightness brightness = Brightness.light,
  Key? boundaryKey,
}) => shad.ShadcnApp.router(
  debugShowCheckedModeBanner: false,
  theme: AppearanceTheme.shadThemeFor(appearance, sorbet, Brightness.light),
  darkTheme: AppearanceTheme.shadThemeFor(appearance, sorbet, Brightness.dark),
  themeMode: brightness == Brightness.dark
      ? shad.ThemeMode.dark
      : shad.ThemeMode.light,
  locale: locale,
  localizationsDelegates: const [
    ...AppLocalizations.localizationsDelegates,
    AppShadcnLocalizationsDelegate(),
  ],
  supportedLocales: AppLocalizations.supportedLocales,
  routerConfig: router,
  builder: (context, child) {
    final hosted = SorbetAppearanceHost(
      appearance: appearance,
      sorbet: sorbet,
      child: ShadcnMaterialBridge(child: child ?? const SizedBox.shrink()),
    );
    if (boundaryKey == null) return hosted;
    return RepaintBoundary(
      key: boundaryKey,
      child: MediaQuery(
        data: MediaQuery.of(context).copyWith(disableAnimations: true),
        child: hosted,
      ),
    );
  },
);

/// Hosts the drawers and sheets a routed [page] opens.
Widget routedTestPage(Widget page) => shad.DrawerOverlay(child: page);
