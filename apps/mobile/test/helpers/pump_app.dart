import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

extension PumpApp on WidgetTester {
  Future<void> pumpApp(Widget widget) {
    final router = GoRouter(
      initialLocation: '/test',
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) => const SizedBox.shrink(),
        ),
        GoRoute(path: '/test', builder: (context, state) => widget),
      ],
    );
    addTearDown(router.dispose);

    return pumpWidget(
      shad.ShadcnApp.router(
        theme: const shad.ThemeData(
          colorScheme: shad.ColorSchemes.lightZinc,
        ),
        darkTheme: const shad.ThemeData.dark(
          colorScheme: shad.ColorSchemes.darkZinc,
        ),
        localizationsDelegates: const [
          ...AppLocalizations.localizationsDelegates,
          shad.ShadcnLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        routerConfig: router,
      ),
    );
  }

  Future<void> drainShadToastTimers() async {
    await pump(const Duration(seconds: 6));
    await pump(const Duration(milliseconds: 50));
  }
}
