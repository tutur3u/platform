import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/router/task_settings_routes.dart';

/// The shipped routes with their pages stubbed; redirects stay real.
GoRouter _router(String initial) => GoRouter(
  initialLocation: initial,
  routes: [
    for (final route in taskSettingsRoutes().cast<GoRoute>())
      GoRoute(
        path: route.path,
        redirect: route.redirect,
        builder: (_, _) => const SizedBox(),
      ),
  ],
);

void main() {
  for (final entry in {
    Routes.taskPlanning: Routes.taskSettings,
    Routes.taskEstimates: Routes.taskSettings,
    Routes.taskPortfolio: Routes.taskSettingsProjects,
    Routes.taskSettings: Routes.taskSettings,
    Routes.taskSettingsLabels: Routes.taskSettingsLabels,
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

  test('Task settings does not take the app preferences alias', () {
    expect(Routes.taskSettings, isNot('${Routes.tasks}/settings'));
  });
}
