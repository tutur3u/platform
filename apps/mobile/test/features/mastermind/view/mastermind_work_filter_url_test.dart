import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_chip.dart';

import '../../../helpers/mastermind_view_harness.dart';
import '../../../helpers/mastermind_work_fixture.dart';
import '../../../helpers/mastermind_work_pump.dart';

final List<Map<String, dynamic>> _products = [
  workLane(1, title: 'Tuturuuu run'),
  workLane(2, title: 'Mastermind run', product: 'Mastermind'),
  workLane(3, title: 'Tuturuuu failure', state: 'failed'),
];

final List<Map<String, dynamic>> _areas = [
  workLane(1, title: 'Billing lane', area: 'finance'),
  workLane(2, title: 'Infra lane', area: 'infra'),
  workLane(3, title: 'Other infra lane', area: 'infra', state: 'failed'),
];

void main() {
  group('a filter that leaves the snapshot also leaves the URL', () {
    testWidgets('the product, after a refresh drops it', (tester) async {
      final router = workRouter(Routes.mastermindWork);
      final harness = await pumpWork(
        tester,
        workJson(_products),
        router: router,
      );
      await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
      await tester.pumpAndSettle();
      expect(
        workUri(router).toString(),
        '${Routes.mastermindWork}?product=Mastermind',
      );

      harness.source.bytes = snapshotBytes(workJson(_products.sublist(2)));
      await harness.snapshot.refresh();
      await tester.pumpAndSettle();

      expect(find.text('Tuturuuu failure'), findsOneWidget);
      expect(workUri(router).toString(), Routes.mastermindWork);
    });

    testWidgets('the area, after a refresh drops it', (tester) async {
      final router = workRouter(Routes.mastermindWork);
      final harness = await pumpWork(tester, workJson(_areas), router: router);
      await tester.tap(find.widgetWithText(AppChip, 'Finance'));
      await tester.pumpAndSettle();
      expect(
        workUri(router).toString(),
        '${Routes.mastermindWork}?area=finance',
      );

      harness.source.bytes = snapshotBytes(workJson(_areas.sublist(1)));
      await harness.snapshot.refresh();
      await tester.pumpAndSettle();

      expect(find.text('Infra lane'), findsOneWidget);
      expect(workUri(router).toString(), Routes.mastermindWork);
    });

    testWidgets('waits for a lane open over the page, then rewrites', (
      tester,
    ) async {
      final router = workRouter(Routes.mastermindWork);
      final harness = await pumpWork(
        tester,
        workJson(_products),
        router: router,
      );
      await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Mastermind run'));
      await tester.pumpAndSettle();
      final lane = workUri(router).toString();
      expect(lane, startsWith('${Routes.mastermindWork}/lane/'));

      // The refresh leaves only that lane, so the Mastermind chip goes while
      // the lane is still open.
      harness.source.bytes = snapshotBytes(workJson(_products.sublist(1, 2)));
      await harness.snapshot.refresh();
      await tester.pumpAndSettle();
      expect(workUri(router).toString(), lane);

      router.pop();
      await tester.pumpAndSettle();
      expect(workUri(router).toString(), Routes.mastermindWork);
      expect(find.text('Mastermind run'), findsOneWidget);
    });

    testWidgets('keeps the filters that are still valid', (tester) async {
      final router = workRouter(Routes.mastermindWork);
      final harness = await pumpWork(
        tester,
        workJson(_products),
        router: router,
      );
      await tester.tap(find.widgetWithText(AppChip, '1 failed'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
      await tester.pumpAndSettle();

      harness.source.bytes = snapshotBytes(workJson(_products.sublist(2)));
      await harness.snapshot.refresh();
      await tester.pumpAndSettle();

      expect(
        workUri(router).toString(),
        '${Routes.mastermindWork}?state=failed',
      );
    });

    testWidgets('a location naming a product the snapshot lacks is cleaned', (
      tester,
    ) async {
      final router = workRouter(
        '${Routes.mastermindWork}?state=running&product=Mastermind',
      );
      await pumpWork(tester, workJson([_products.first]), router: router);
      expect(find.text('Tuturuuu run'), findsOneWidget);
      expect(
        workUri(router).toString(),
        '${Routes.mastermindWork}?state=running',
      );
    });

    testWidgets('a filter that is still valid is left alone', (tester) async {
      final router = workRouter('${Routes.mastermindWork}?product=Mastermind');
      await pumpWork(tester, workJson(_products), router: router);
      expect(
        workUri(router).toString(),
        '${Routes.mastermindWork}?product=Mastermind',
      );
      expect(find.text('Mastermind run'), findsOneWidget);
      expect(find.text('Tuturuuu run'), findsNothing);
    });
  });
}
