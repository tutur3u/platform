import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';

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
    testWidgets('a failing environment row opens Ship on its product', (
      tester,
    ) async {
      final router = workRouter(Routes.mastermind);
      await pumpShip(tester, _json(), router: router);
      await tester.tap(find.text('Needs attention'));
      await tester.pumpAndSettle();
      expect(
        workUri(router).toString(),
        '${Routes.mastermindShip}?product=Upskii',
      );
      expect(find.text('Deploy failure'), findsOneWidget);
    });

    testWidgets('a release row opens Ship on its product', (tester) async {
      final router = workRouter(Routes.mastermind);
      await pumpShip(tester, _json(), router: router);
      // The words open the row; only the clock beside them is its own target.
      await tester.tapAt(
        tester.getTopLeft(findTimeLabel('Live 2m')) + const Offset(4, 4),
      );
      await tester.pumpAndSettle();
      expect(
        workUri(router).toString(),
        '${Routes.mastermindShip}?product=Tuturuuu+web',
      );
      expect(find.text('Deploy failure'), findsNothing);
    });

    testWidgets('the Usage link opens the Insights tab', (tester) async {
      final router = workRouter(Routes.mastermind);
      await pumpShip(
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
