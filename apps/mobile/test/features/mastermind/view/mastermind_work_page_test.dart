import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/deep_links.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_chip.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';

import '../../../helpers/mastermind_view_harness.dart';
import '../../../helpers/mastermind_work_fixture.dart';
import '../../../helpers/mastermind_work_pump.dart';

final List<Map<String, dynamic>> _mixed = [
  workLane(1, state: 'queued', title: 'Queued lane', ageSeconds: 60),
  workLane(2, title: 'Old running', ageSeconds: 9000),
  workLane(3, title: 'New running', ageSeconds: 600),
  workLane(4, state: 'failed', title: 'Broken lane', product: 'Mastermind'),
  workLane(5, state: 'waiting', title: 'Waiting lane'),
  workLane(6, title: 'Third running', ageSeconds: 1200),
];

double _top(WidgetTester tester, String text) =>
    tester.getTopLeft(find.text(text)).dy;

Iterable<String> _allText(WidgetTester tester) =>
    tester.widgetList<Text>(find.byType(Text)).map((t) => t.data ?? '');

void main() {
  group('grouping', () {
    testWidgets('groups by state, the one that needs attention first', (
      tester,
    ) async {
      await pumpWork(tester, workJson(_mixed));
      final order = ['Failed', 'Waiting', 'Running', 'Queued', 'Security'];
      final tops = [for (final label in order) _top(tester, label)];
      expect([...tops]..sort(), tops, reason: order.join(' < '));
      expect(tops.toSet(), hasLength(order.length));
    });

    testWidgets('shows a count per group, normal lanes only', (tester) async {
      await pumpWork(tester, workJson(_mixed));
      expect(find.text('3'), findsOneWidget); // three running
      expect(find.text('1'), findsNWidgets(3)); // failed, waiting, queued
    });

    testWidgets('orders a group oldest first', (tester) async {
      await pumpWork(tester, workJson(_mixed));
      expect(
        _top(tester, 'Old running') < _top(tester, 'Third running'),
        isTrue,
      );
      expect(
        _top(tester, 'Third running') < _top(tester, 'New running'),
        isTrue,
      );
    });

    testWidgets('state chips carry the counts', (tester) async {
      await pumpWork(tester, workJson(_mixed));
      for (final label in ['1 failed', '1 waiting', '3 running', '1 queued']) {
        expect(
          find.widgetWithText(AppChip, label),
          findsOneWidget,
          reason: label,
        );
      }
    });
  });

  group('row copy', () {
    testWidgets('says how long, with an ETA when there is one', (tester) async {
      await pumpWork(
        tester,
        workJson([
          workLane(
            1,
            etaSeconds: 1200,
            area: 'finance',
            kind: 'implementation',
          ),
        ]),
      );
      expect(find.text('Lead · claude / claude-opus-4-1'), findsOneWidget);
      expect(find.text('Running for 2 h · About 20 min left'), findsOneWidget);
      expect(find.text('Tuturuuu'), findsOneWidget);
      expect(find.text('Finance'), findsOneWidget);
      expect(find.text('Implementation'), findsOneWidget);
    });

    testWidgets('an unknown age says so and no ETA hides the line', (
      tester,
    ) async {
      await pumpWork(tester, workJson([workLane(1, ageSeconds: null)]));
      expect(find.text('Running · age unknown'), findsOneWidget);
      expect(find.textContaining('left'), findsNothing);
      expect(find.textContaining('null'), findsNothing);
    });

    testWidgets('provider and model are shown verbatim', (tester) async {
      await pumpWork(
        tester,
        workJson([workLane(1, providerModel: 'Unknown model')]),
      );
      expect(find.text('Lead · Unknown model'), findsOneWidget);
    });
  });

  group('the ?state= filter', () {
    testWidgets('starts the list on that state, with its chip selected', (
      tester,
    ) async {
      await pumpWork(tester, workJson(_mixed), state: LaneState.failed);
      expect(find.text('Broken lane'), findsOneWidget);
      expect(find.text('Old running'), findsNothing);
      expect(find.text('Waiting lane'), findsNothing);
      expect(
        tester
            .widget<AppChip>(find.widgetWithText(AppChip, '1 failed'))
            .selected,
        isTrue,
      );
    });

    testWidgets('All clears it, and a chip changes it', (tester) async {
      await pumpWork(tester, workJson(_mixed), state: LaneState.failed);
      await tester.tap(find.widgetWithText(AppChip, '3 running'));
      await tester.pumpAndSettle();
      expect(find.text('Old running'), findsOneWidget);
      expect(find.text('Broken lane'), findsNothing);
      await tester.tap(find.widgetWithText(AppChip, 'All'));
      await tester.pumpAndSettle();
      expect(find.text('Broken lane'), findsOneWidget);
      expect(find.text('Old running'), findsOneWidget);
    });

    testWidgets('a state with no lanes can still be cleared', (tester) async {
      await pumpWork(tester, workJson(_mixed), state: LaneState.idle);
      expect(find.text('No matching lanes'), findsOneWidget);
      expect(find.widgetWithText(AppChip, '0 idle'), findsOneWidget);
      await tester.tap(find.widgetWithText(AppChip, 'All'));
      await tester.pumpAndSettle();
      expect(find.text('Broken lane'), findsOneWidget);
      expect(find.text('No matching lanes'), findsNothing);
    });

    testWidgets('comes from the query and follows a new one', (tester) async {
      final router = workRouter('${Routes.mastermindWork}?state=failed');
      await pumpWork(tester, workJson(_mixed), router: router);
      expect(find.text('Broken lane'), findsOneWidget);
      expect(find.text('Old running'), findsNothing);

      router.go('${Routes.mastermindWork}?state=running');
      await tester.pumpAndSettle();
      expect(find.text('Old running'), findsOneWidget);
      expect(find.text('Broken lane'), findsNothing);
    });

    testWidgets('an unknown state in the query is ignored', (tester) async {
      final router = workRouter('${Routes.mastermindWork}?state=bogus');
      await pumpWork(tester, workJson(_mixed), router: router);
      expect(find.text('Broken lane'), findsOneWidget);
      expect(find.text('Old running'), findsOneWidget);
    });

    testWidgets('a Home lane chip opens Work on that state', (tester) async {
      final router = workRouter(Routes.mastermind);
      await pumpWork(tester, workJson(_mixed), router: router);
      await tester.tap(find.widgetWithText(AppChip, '1 failed'));
      await tester.pumpAndSettle();
      expect(find.text('Broken lane'), findsOneWidget);
      expect(find.text('Old running'), findsNothing);
    });
  });

  group('search and product filters', () {
    testWidgets('the search field has a placeholder', (tester) async {
      await pumpWork(tester, workJson(_mixed));
      expect(find.text('Search lanes'), findsOneWidget);
    });

    testWidgets('search narrows the list', (tester) async {
      await pumpWork(tester, workJson(_mixed));
      await tester.enterText(find.byType(TextField), 'broken');
      await tester.pumpAndSettle();
      expect(find.text('Broken lane'), findsOneWidget);
      expect(find.text('Old running'), findsNothing);
      await tester.enterText(find.byType(TextField), 'zzz-no-match');
      await tester.pumpAndSettle();
      expect(find.text('No matching lanes'), findsOneWidget);
      expect(find.text('Mastermind · security fix'), findsOneWidget);
    });

    testWidgets('product chips filter the lanes', (tester) async {
      await pumpWork(tester, workJson(_mixed));
      await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
      await tester.pumpAndSettle();
      expect(find.text('Broken lane'), findsOneWidget);
      expect(find.text('Old running'), findsNothing);
      await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
      await tester.pumpAndSettle();
      expect(find.text('Old running'), findsOneWidget);
    });

    testWidgets('a product filter is reset when its product leaves', (
      tester,
    ) async {
      final harness = await pumpWork(tester, workJson(_mixed));
      await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
      await tester.pumpAndSettle();
      expect(find.text('Old running'), findsNothing);

      // The refresh drops the only Mastermind lane, and with it the chips.
      harness.source.bytes = snapshotBytes(
        workJson([for (final lane in _mixed) lane]..removeAt(3)),
      );
      await harness.snapshot.refresh();
      await tester.pumpAndSettle();
      expect(find.widgetWithText(AppChip, 'Mastermind'), findsNothing);
      expect(find.text('Old running'), findsOneWidget);
      expect(find.text('No matching lanes'), findsNothing);
    });

    testWidgets('no product chips when there is one product', (tester) async {
      await pumpWork(tester, workJson([workLane(1), workLane(2)]));
      expect(find.widgetWithText(AppChip, 'Tuturuuu'), findsNothing);
    });
  });

  group('area filter', () {
    final areas = [
      workLane(1, title: 'Billing lane', area: 'finance'),
      workLane(2, title: 'Infra lane', area: 'infra'),
      workLane(3, title: 'Other infra lane', area: 'infra', state: 'failed'),
    ];

    testWidgets('area chips filter the lanes', (tester) async {
      await pumpWork(tester, workJson(areas));
      await tester.tap(find.widgetWithText(AppChip, 'Finance'));
      await tester.pumpAndSettle();
      expect(find.text('Billing lane'), findsOneWidget);
      expect(find.text('Infra lane'), findsNothing);
      await tester.tap(find.widgetWithText(AppChip, 'Finance'));
      await tester.pumpAndSettle();
      expect(find.text('Infra lane'), findsOneWidget);
    });

    testWidgets('no area chips when there is one area', (tester) async {
      await pumpWork(
        tester,
        workJson([workLane(1, area: 'infra'), workLane(2, area: 'infra')]),
      );
      expect(find.widgetWithText(AppChip, 'Infrastructure'), findsNothing);
    });

    testWidgets('an area filter is reset when its area leaves', (tester) async {
      final harness = await pumpWork(tester, workJson(areas));
      await tester.tap(find.widgetWithText(AppChip, 'Finance'));
      await tester.pumpAndSettle();
      expect(find.text('Infra lane'), findsNothing);

      // The refresh drops the only finance lane, and with it the chips.
      harness.source.bytes = snapshotBytes(workJson(areas.sublist(1)));
      await harness.snapshot.refresh();
      await tester.pumpAndSettle();
      expect(find.widgetWithText(AppChip, 'Finance'), findsNothing);
      expect(find.text('Infra lane'), findsOneWidget);
      expect(find.text('No matching lanes'), findsNothing);
    });

    testWidgets('comes from the query', (tester) async {
      final router = workRouter('${Routes.mastermindWork}?area=finance');
      await pumpWork(tester, workJson(areas), router: router);
      expect(find.text('Billing lane'), findsOneWidget);
      expect(find.text('Infra lane'), findsNothing);
    });
  });

  group('state chip counts', () {
    testWidgets('follow the product filter, like the group headers', (
      tester,
    ) async {
      await pumpWork(
        tester,
        workJson([
          workLane(1),
          workLane(2),
          workLane(3),
          workLane(4, product: 'Mastermind'),
          workLane(5, state: 'failed'),
        ]),
      );
      expect(find.widgetWithText(AppChip, '4 running'), findsOneWidget);
      await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(AppChip, '1 running'), findsOneWidget);
      expect(find.widgetWithText(AppChip, '4 running'), findsNothing);
      expect(find.widgetWithText(AppChip, '1 failed'), findsNothing);
    });

    testWidgets('follow the search', (tester) async {
      await pumpWork(tester, workJson(_mixed));
      await tester.enterText(find.byType(TextField), 'running');
      await tester.pumpAndSettle();
      expect(find.widgetWithText(AppChip, '3 running'), findsOneWidget);
      expect(find.widgetWithText(AppChip, '1 failed'), findsNothing);
    });
  });

  group('clear filters', () {
    testWidgets('resets state, product, area and search', (tester) async {
      final router = workRouter(Routes.mastermindWork);
      await pumpWork(
        tester,
        workJson([
          workLane(1, area: 'infra'),
          workLane(2, area: 'finance', product: 'Mastermind'),
        ]),
        router: router,
      );
      await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(AppChip, 'Infrastructure'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'zzz');
      await tester.pumpAndSettle();
      expect(find.text('No matching lanes'), findsOneWidget);

      await tester.tap(find.text('Clear filters'));
      await tester.pumpAndSettle();
      expect(find.text('No matching lanes'), findsNothing);
      expect(find.text('Lane 1'), findsOneWidget);
      expect(find.text('Lane 2'), findsOneWidget);
      expect(find.text('zzz'), findsNothing);
      expect(workUri(router).toString(), Routes.mastermindWork);
    });

    testWidgets('is only offered when nothing matches', (tester) async {
      await pumpWork(tester, workJson(_mixed));
      expect(find.text('Clear filters'), findsNothing);
    });
  });

  group('security rows', () {
    testWidgets('render as one redacted line in a trailing group', (
      tester,
    ) async {
      await pumpWork(tester, workJson(_mixed));
      expect(find.text('Mastermind · security fix'), findsOneWidget);
      expect(_top(tester, 'Security') > _top(tester, 'Queued lane'), isTrue);
    });

    testWidgets('have no severity, id, count or tap target', (tester) async {
      await pumpWork(tester, workJson(_mixed));
      final text = _allText(tester).join('\n').toLowerCase();
      expect(text, isNot(contains('severity')));
      expect(text, isNot(contains('critical')));
      expect(text, isNot(contains('security issue')));
      expect(text, isNot(contains('item-')));
      expect(
        find.ancestor(
          of: find.text('Mastermind · security fix'),
          matching: find.byType(InkWell),
        ),
        findsNothing,
      );
      expect(find.textContaining('Security ('), findsNothing);
    });

    testWidgets('are not counted, filtered or searched', (tester) async {
      await pumpWork(tester, workJson(_mixed), state: LaneState.failed);
      // Two lanes in the security row's own state change nothing: it is not a
      // running lane, so the running chip still counts three.
      expect(find.widgetWithText(AppChip, '3 running'), findsOneWidget);
      expect(find.text('Mastermind · security fix'), findsOneWidget);
    });

    testWidgets('alone, still list the line and offer no filters', (
      tester,
    ) async {
      await pumpWork(tester, workJson(const []));
      expect(find.text('No lanes right now'), findsOneWidget);
      expect(find.text('Mastermind · security fix'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
    });
  });

  group('whole-section states', () {
    testWidgets('empty: no lanes and no security rows', (tester) async {
      await pumpWork(tester, workJson(const [], security: false));
      expect(find.text('No lanes right now'), findsOneWidget);
      expect(find.text('Security'), findsNothing);
    });

    testWidgets('stale data reads as last published, lanes still shown', (
      tester,
    ) async {
      final json = workJson(_mixed)
        ..['generated_at'] = '2026-01-31T14:30:00+00:00';
      await pumpWork(tester, json);
      expect(
        find.textContaining('Mastermind last published 3 h ago'),
        findsOneWidget,
      );
      expect(find.text('Broken lane'), findsOneWidget);
    });

    testWidgets('offline keeps the cached lanes under a warning strip', (
      tester,
    ) async {
      final harness = await pumpWork(tester, workJson(_mixed));
      harness.scheduler.setOnline(online: false);
      harness.source.fetcher = () async =>
          const SnapshotFetch.unavailable(SnapshotUnavailableKind.unavailable);
      await harness.snapshot.refresh();
      await tester.pumpAndSettle();
      expect(find.textContaining('Offline · showing'), findsOneWidget);
      expect(find.text('Broken lane'), findsOneWidget);
    });

    testWidgets('forbidden says so and shows no lanes', (tester) async {
      final source = FakeHubSource()
        ..fetcher = () async =>
            const SnapshotFetch.unavailable(SnapshotUnavailableKind.forbidden);
      await pumpWork(tester, workJson(_mixed), source: source);
      expect(
        find.text("This account isn't allowed to view Mastermind"),
        findsOneWidget,
      );
      expect(find.text('Broken lane'), findsNothing);
      expect(find.byType(TextField), findsNothing);
    });
  });

  group('layout', () {
    testWidgets('the last row clears the dock', (tester) async {
      const height = 800.0;
      const dock = 120.0;
      await pumpWork(
        tester,
        workJson(_mixed),
        size: const Size(430, height),
        dockClearance: dock,
      );
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -3000));
      await tester.pumpAndSettle();
      final last = tester.getRect(find.byType(AppGroupedRow).last);
      expect(last.bottom, lessThanOrEqualTo(height - dock));
    });

    testWidgets('adds no AppBar or Back control of its own', (tester) async {
      await pumpWork(tester, workJson(_mixed));
      expect(find.byType(AppBar), findsNothing);
      expect(find.byType(BackButton), findsNothing);
      expect(find.byIcon(Icons.arrow_back), findsNothing);
    });
  });

  group('navigation', () {
    testWidgets('tapping a lane opens its detail by opaque id', (tester) async {
      final router = workRouter(Routes.mastermindWork);
      await pumpWork(tester, workJson(_mixed), router: router);
      await tester.tap(find.text('Broken lane'));
      await tester.pumpAndSettle();
      expect(workUri(router).path, Routes.mastermindWorkLanePath(laneId(4)));
      expect(find.text('Role'), findsOneWidget);
    });

    testWidgets('a chip keeps its filter in the URL', (tester) async {
      final router = workRouter(Routes.mastermindWork);
      await pumpWork(tester, workJson(_mixed), router: router);
      String location() => workUri(router).toString();

      await tester.tap(find.widgetWithText(AppChip, '3 running'));
      await tester.pumpAndSettle();
      expect(location(), '${Routes.mastermindWork}?state=running');
      await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
      await tester.pumpAndSettle();
      expect(
        location(),
        '${Routes.mastermindWork}?state=running&product=Mastermind',
      );
      await tester.tap(find.widgetWithText(AppChip, 'All'));
      await tester.pumpAndSettle();
      expect(location(), '${Routes.mastermindWork}?product=Mastermind');
    });

    testWidgets('Back from a lane keeps the Home failed-chip filter', (
      tester,
    ) async {
      final router = workRouter(Routes.mastermind);
      await pumpWork(tester, workJson(_mixed), router: router);
      await tester.tap(find.widgetWithText(AppChip, '1 failed'));
      await tester.pumpAndSettle();
      expect(find.text('Old running'), findsNothing);

      await tester.tap(find.text('Broken lane'));
      await tester.pumpAndSettle();
      expect(find.text('Role'), findsOneWidget);

      // What the dock Back does for a lane: pop to the list that opened it.
      expect(Routes.isMastermindLaneLocation(workUri(router).path), isTrue);
      expect(router.canPop(), isTrue);
      router.pop();
      await tester.pumpAndSettle();
      expect(workUri(router).queryParameters['state'], 'failed');
      expect(find.text('Broken lane'), findsOneWidget);
      expect(find.text('Old running'), findsNothing);
      expect(
        tester
            .widget<AppChip>(find.widgetWithText(AppChip, '1 failed'))
            .selected,
        isTrue,
      );
    });

    testWidgets('Back from a lane keeps the product and search too', (
      tester,
    ) async {
      final router = workRouter(Routes.mastermindWork);
      await pumpWork(tester, workJson(_mixed), router: router);
      await tester.tap(find.widgetWithText(AppChip, 'Tuturuuu'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'running');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Old running'));
      await tester.pumpAndSettle();

      router.pop();
      await tester.pumpAndSettle();
      expect(find.text('Old running'), findsOneWidget);
      expect(find.text('Waiting lane'), findsNothing);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller?.text,
        'running',
      );
      expect(workUri(router).queryParameters['product'], 'Tuturuuu');
    });

    test('only a lane detail pops back to its list', () {
      expect(Routes.isMastermindLaneLocation(Routes.mastermindWork), isFalse);
      expect(
        Routes.isMastermindLaneLocation(Routes.mastermindWorkLanePath('a')),
        isTrue,
      );
      expect(
        Routes.isMastermindLaneLocation(Routes.mastermindInboxItemPath('a')),
        isFalse,
      );
    });
  });

  group('deep links', () {
    test('open the Work tab root and never carry a lane id or filter', () {
      for (final path in [
        'personal/mastermind/work',
        'personal/mastermind/work?state=failed',
        'personal/mastermind/work/lane/${laneId(1)}',
      ]) {
        final link = resolveMobileDeepLink(
          Uri.parse('https://tuturuuu.com/$path'),
        );
        expect(link?.location, Routes.mastermindWork, reason: path);
        expect(link?.location, isNot(contains('item-')));
      }
    });
  });
}
