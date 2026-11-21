import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/ship/ship_page.dart';

import '../../../helpers/mastermind_home_fixture.dart';
import '../../../helpers/mastermind_ship_fixture.dart';
import '../../../helpers/mastermind_ship_pump.dart';
import '../../../helpers/mastermind_time_finder.dart';
import '../../../helpers/mastermind_usage_fixture.dart';
import '../../../helpers/mastermind_work_pump.dart';

Map<String, dynamic> _json() {
  final root = homeJson(needsYou: false);
  root['environments'] = [
    shipEnv('Upskii', environment: 'staging', deploy: 'failure'),
    shipEnv('Upskii'),
    shipEnv('Tuturuuu web'),
  ];
  (root['products'] as Map<String, dynamic>)['releases'] = [
    shipRelease('Upskii'),
    shipRelease('Tuturuuu web', ageSeconds: 1),
  ];
  return root;
}

void main() {
  group('Home opens the tabs that now exist', () {
    testWidgets('a failing environment row opens Ship', (tester) async {
      final router = workRouter(Routes.mastermind);
      await pumpMastermindRoute(tester, _json(), router: router);
      await tester.tap(find.text('Needs attention'));
      await tester.pumpAndSettle();
      expect(workUri(router).toString(), Routes.mastermindShip);
      // Ship reads the live collector, not the hub snapshot.
      expect(find.byType(ShipLivePage), findsOneWidget);
    });

    testWidgets('a release row opens Ship', (tester) async {
      final router = workRouter(Routes.mastermind);
      await pumpMastermindRoute(tester, _json(), router: router);
      // The words open the row; only the clock beside them is its own target.
      await tester.tapAt(
        tester.getTopLeft(findTimeLabel('Live 2m')) + const Offset(4, 4),
      );
      await tester.pumpAndSettle();
      expect(workUri(router).toString(), Routes.mastermindShip);
      expect(find.byType(ShipLivePage), findsOneWidget);
    });

    testWidgets('the Usage link opens the Insights tab', (tester) async {
      final router = workRouter(Routes.mastermind);
      await pumpMastermindRoute(
        tester,
        usageJson(instances: [usagePoint('Claude pool A')]),
        router: router,
      );
      await tester.tap(find.text('Usage'));
      await tester.pumpAndSettle();
      expect(workUri(router).path, Routes.mastermindInsights);
      expect(find.text('Session left'), findsOneWidget);
    });
  });
}
