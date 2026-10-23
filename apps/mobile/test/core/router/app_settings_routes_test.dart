import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/app_settings_routes.dart';
import 'package:mobile/core/router/deep_links.dart';
import 'package:mobile/core/router/routes.dart';

/// The shipped routes with their pages stubbed; redirects stay real.
List<RouteBase> _stubbed(List<RouteBase> routes) => [
  for (final route in routes.cast<GoRoute>())
    GoRoute(
      path: route.path,
      redirect: route.redirect,
      builder: (_, _) => const SizedBox(),
    ),
];

GoRouter _router(String initial) => GoRouter(
  initialLocation: initial,
  routes: [
    // Mirrors app_router: aliases precede the parameterised detail routes.
    ..._stubbed(appSettingsAliasRoutes()),
    GoRoute(path: Routes.settings, builder: (_, _) => const SizedBox()),
    ..._stubbed(appSettingsRoutes()),
    GoRoute(path: Routes.taskDetail, builder: (_, _) => const SizedBox()),
    GoRoute(
      path: Routes.calendarEventDetail,
      builder: (_, _) => const SizedBox(),
    ),
    GoRoute(path: Routes.finance, builder: (_, _) => const SizedBox()),
    GoRoute(path: Routes.timer, builder: (_, _) => const SizedBox()),
  ],
);

void main() {
  test('only routed apps resolve a central settings location', () {
    expect(Routes.centralAppSettingsIds, {
      'tasks',
      'calendar',
      'finance',
      'timer',
    });
    expect(Routes.appSettingsLocation('timer'), '/settings/apps/timer');
    expect(Routes.appSettingsLocation('mail'), isNull);
    expect(Routes.appSettingsLocation(null), isNull);
  });

  test('registered detail routes keep the shipped redirect contract', () {
    final paths = appSettingsRoutes().whereType<GoRoute>().map((r) => r.path);
    expect(paths, [Routes.settingsApps, Routes.settingsAppDetail]);
  });

  for (final entry in {
    '/tasks/settings': '/settings/apps/tasks',
    '/calendar/settings': '/settings/apps/calendar',
    '/finance/settings': '/settings/apps/finance',
    '/timer/settings': '/settings/apps/timer',
    '/settings/apps': Routes.settings,
    '/settings/apps/mail': Routes.settings,
    '/settings/apps/unknown': Routes.settings,
    '/settings/apps/finance': '/settings/apps/finance',
  }.entries) {
    testWidgets('${entry.key} opens ${entry.value}', (tester) async {
      final router = _router(entry.key);
      addTearDown(router.dispose);
      await tester.pumpWidget(
        WidgetsApp.router(color: const Color(0xFF000000), routerConfig: router),
      );
      await tester.pump();
      expect(router.state.matchedLocation, entry.value);
      expect(tester.takeException(), isNull);
    });
  }

  test('web and app links open the central app settings', () {
    for (final entry in {
      'https://tuturuuu.com/en/personal/settings/apps/timer':
          '/settings/apps/timer',
      'https://tuturuuu.com/personal/settings/apps/mail': Routes.settings,
      'https://tuturuuu.com/personal/finance/settings':
          '/settings/apps/finance',
      'https://tuturuuu.com/personal/calendar/settings':
          '/settings/apps/calendar',
      'https://tuturuuu.com/personal/tasks/settings': '/settings/apps/tasks',
      'https://tasks.tuturuuu.com/personal/settings': '/settings/apps/tasks',
      // Unrelated module paths keep their previous destinations.
      'https://tuturuuu.com/personal/calendar': Routes.calendar,
      'https://tuturuuu.com/personal/settings/offline/tasks':
          Routes.settingsOfflineModulePath('tasks'),
    }.entries) {
      expect(
        resolveMobileDeepLink(Uri.parse(entry.key))?.location,
        entry.value,
        reason: entry.key,
      );
    }
  });
}
