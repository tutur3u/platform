import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/view/mastermind_routes.dart';
import 'package:mobile/features/mastermind/view/work/mastermind_lane_page.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_view_harness.dart';
import '../../../helpers/mastermind_work_fixture.dart';

Future<MastermindViewHarness> _pump(
  WidgetTester tester,
  Map<String, dynamic> json, {
  String id = '',
  GoRouter? router,
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(430, 4000);
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  final harness = MastermindViewHarness(
    source: FakeHubSource(bytes: snapshotBytes(json)),
  );
  addTearDown(harness.dispose);
  await harness.setAccess(TestAccess.enabled);
  if (router == null) {
    await tester.pumpApp(harness.wrap(MastermindLanePage(laneId: id)));
  } else {
    await tester.pumpAppRouter(router, wrap: harness.wrap);
  }
  await tester.pumpAndSettle();
  return harness;
}

Iterable<String> _allText(WidgetTester tester) =>
    tester.widgetList<Text>(find.byType(Text)).map((t) => t.data ?? '');

void main() {
  final full = workLane(
    1,
    state: 'waiting',
    role: 'Ops',
    ageSeconds: 3 * 3600,
    etaSeconds: 1800,
    area: 'infra',
    kind: 'review',
  );

  group('detail', () {
    testWidgets('shows every field in full and no action', (tester) async {
      await _pump(tester, workJson([full]), id: laneId(1));
      for (final text in [
        'State',
        'waiting',
        'Role',
        'Ops',
        'Model',
        'claude / claude-opus-4-1',
        'Age',
        '3 h',
        'Estimated time left',
        '30 min',
        'Product',
        'Tuturuuu',
        'Area',
        'Infrastructure',
        'Kind',
        'Review',
      ]) {
        expect(find.text(text), findsOneWidget, reason: text);
      }
      expect(find.byType(ElevatedButton), findsNothing);
      expect(find.byType(TextField), findsNothing);
    });

    testWidgets('an unpublished age gives a reason and no ETA drops the row', (
      tester,
    ) async {
      await _pump(
        tester,
        workJson([workLane(1, ageSeconds: null)]),
        id: laneId(1),
      );
      expect(find.text('Not published yet'), findsOneWidget);
      expect(find.text('Estimated time left'), findsNothing);
      expect(find.text('Product'), findsOneWidget);
      expect(find.text('Area'), findsNothing);
      expect(find.text('Kind'), findsNothing);
    });

    testWidgets('never shows an id, severity or the security row', (
      tester,
    ) async {
      await _pump(tester, workJson([full]), id: laneId(1));
      final text = _allText(tester).join('\n').toLowerCase();
      expect(text, isNot(contains('item-')));
      expect(text, isNot(contains('severity')));
      expect(text, isNot(contains('security')));
    });

    testWidgets('adds no AppBar or Back control of its own', (tester) async {
      await _pump(tester, workJson([full]), id: laneId(1));
      expect(find.byType(AppBar), findsNothing);
      expect(find.byType(BackButton), findsNothing);
    });
  });

  group('gone and updated', () {
    testWidgets('an unknown id is a state, not an error', (tester) async {
      await _pump(tester, workJson([full]), id: laneId(9));
      expect(find.text('This lane is no longer in Mastermind'), findsOneWidget);
      expect(find.text('Back to Work'), findsOneWidget);
    });

    testWidgets('a security row is never a lane', (tester) async {
      await _pump(tester, workJson(const []), id: 'Security issue');
      expect(find.text('This lane is no longer in Mastermind'), findsOneWidget);
    });

    testWidgets('Back to Work goes to the tab root', (tester) async {
      final router = GoRouter(
        initialLocation: Routes.mastermindWorkLanePath(laneId(9)),
        routes: [...mastermindTabRoutes],
      );
      addTearDown(router.dispose);
      await _pump(tester, workJson([full]), router: router);
      await tester.tap(find.text('Back to Work'));
      await tester.pumpAndSettle();
      expect(
        router.routeInformationProvider.value.uri.path,
        Routes.mastermindWork,
      );
    });

    testWidgets('a lane that leaves while open says it finished', (
      tester,
    ) async {
      final harness = await _pump(tester, workJson([full]), id: laneId(1));
      expect(find.text('Ops'), findsOneWidget);
      harness.source.bytes = snapshotBytes(workJson([workLane(2)]));
      await harness.snapshot.refresh();
      await tester.pumpAndSettle();
      expect(find.text('This lane finished or was removed'), findsOneWidget);
      expect(find.text('Ops'), findsNothing);
    });

    testWidgets('a lane that moves on is updated in place with a banner', (
      tester,
    ) async {
      final harness = await _pump(tester, workJson([full]), id: laneId(1));
      expect(find.text('This lane was updated'), findsNothing);
      harness.source.bytes = snapshotBytes(
        workJson([
          {...full, 'state': 'failed', 'age_seconds': 60},
        ]),
      );
      await harness.snapshot.refresh();
      await tester.pumpAndSettle();
      expect(find.text('This lane was updated'), findsOneWidget);
      expect(find.text('failed'), findsOneWidget);
      expect(find.text('waiting'), findsNothing);
      expect(find.text('1 min'), findsOneWidget);
    });
  });
}
