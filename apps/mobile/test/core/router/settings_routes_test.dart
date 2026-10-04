import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/router/settings_routes.dart';

void main() {
  for (final entry in {
    Routes.profileEdit: Routes.settingsProfile,
    Routes.profileAccounts: Routes.settingsAccounts,
  }.entries) {
    testWidgets('legacy ${entry.key} opens ${entry.value}', (tester) async {
      final legacy = settingsRoutes().whereType<GoRoute>().singleWhere(
        (route) => route.path == entry.key,
      );
      final router = GoRouter(
        initialLocation: entry.key,
        routes: [
          legacy,
          GoRoute(path: entry.value, builder: (_, _) => const SizedBox()),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        WidgetsApp.router(color: const Color(0xFF000000), routerConfig: router),
      );
      await tester.pump();
      expect(router.state.matchedLocation, entry.value);
      expect(tester.takeException(), isNull);
    });
  }
}
