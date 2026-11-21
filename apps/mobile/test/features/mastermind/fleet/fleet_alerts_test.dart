import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_today_page.dart';

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/mastermind_fleet_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

Map<String, dynamic> _alert({
  String id = 'slo-workers-availability-page-meet-0123456789abcdef',
  String service = 'tuturuuu-meet',
  String severity = 'page',
  String indicator = 'availability',
  num burnLong = 20.5,
  num burnShort = 32,
}) => {
  'id': id,
  'service': service,
  'severity': severity,
  'indicator': indicator,
  'burnLong': burnLong,
  'burnShort': burnShort,
  'startedAt': '2026-11-20T02:50:00Z',
};

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#fleet-sync
void main() {
  group('FleetSnapshot alerts', () {
    test('parses firing alerts and drops malformed rows', () {
      final snapshot = FleetSnapshot.parse(
        fleetSampleJson(
          alerts: [
            _alert(),
            _alert(id: 'ticket-1', severity: 'ticket', indicator: 'latency'),
            {..._alert(id: 'bad'), 'severity': 'critical'},
            {..._alert(id: 'bad-burn'), 'burnLong': '20'},
          ],
        ),
      );
      expect(snapshot.alerts.map((a) => a.id), [
        'slo-workers-availability-page-meet-0123456789abcdef',
        'ticket-1',
      ]);
      expect(snapshot.alerts.last.indicator, FleetAlertIndicator.latency);
      expect(snapshot.pageAlerts, hasLength(1));
    });

    test('a page burn counts toward needs-you, a ticket does not', () {
      final base = FleetSnapshot.parse(fleetSampleJson());
      final withAlerts = FleetSnapshot.parse(
        fleetSampleJson(
          alerts: [
            _alert(),
            _alert(id: 't', severity: 'ticket'),
          ],
        ),
      );
      expect(base.alerts, isEmpty);
      expect(
        withAlerts.needsYouCountAt(fleetTestNow),
        base.needsYouCountAt(fleetTestNow) + 1,
      );
      final answered = withAlerts.withAnswer(
        'pool-switch',
        FleetAnswerReceipt.parse({
          'action': 'hold',
          'revision': 1,
          'answeredAt': '2026-11-20T03:01:00Z',
          'pickedUp': false,
        })!,
      );
      expect(answered.alerts, hasLength(2));
    });
  });

  group('Today', () {
    late FakeFleetSource source;
    late MastermindViewHarness harness;

    setUp(() async {
      source = FakeFleetSource();
      harness = MastermindViewHarness(
        fleet: FleetCubit(source: source, newKey: () => 'key-1'),
      );
      await harness.setAccess(TestAccess.enabled);
    });

    tearDown(() => harness.dispose());

    Future<void> pump(WidgetTester tester) async {
      DesignRender.setSize(tester, DesignRender.sizes['phone']!);
      final (settings, brightness) = DesignRender.themes['light']!;
      await tester.pumpWidget(
        DesignRenderApp(
          settings: settings,
          brightness: brightness,
          child: harness.wrap(FleetTodayPage(now: () => fleetTestNow)),
        ),
      );
      await tester.pump();
      await tester.pump();
    }

    testWidgets('pages lead the hero, count as needs-you and list as rows', (
      tester,
    ) async {
      source.json = fleetSampleJson(
        alerts: [
          _alert(),
          _alert(
            id: 'ticket-1',
            service: 'web',
            severity: 'ticket',
            indicator: 'latency',
            burnLong: 6.25,
            burnShort: 7,
          ),
        ],
      );
      await pump(tester);
      expect(find.text('1 SLO is paging'), findsOneWidget);
      // Two open decisions plus one paging burn.
      expect(find.text('3'), findsWidgets);
      await tester.scrollUntilVisible(find.text('SLO burn alerts'), 200);
      expect(find.text('tuturuuu-meet'), findsOneWidget);
      expect(
        find.text('Availability · burn 21× long, 32× short'),
        findsOneWidget,
      );
      expect(find.text('Latency · burn 6.3× long, 7.0× short'), findsOneWidget);
      expect(find.text('Page'), findsOneWidget);
      expect(find.text('Ticket'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    });

    testWidgets('a page alone counts without opening an empty Inbox', (
      tester,
    ) async {
      source.json = fleetSampleJson(decisions: [], alerts: [_alert()]);
      await pump(tester);
      final tile = tester.widget<AppStatTile>(
        find.byWidgetPredicate(
          (w) => w is AppStatTile && w.label == 'Need you',
        ),
      );
      expect(tile.value, '1');
      expect(tile.onTap, isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });

    testWidgets('without alerts, nothing about SLOs shows', (tester) async {
      await pump(tester);
      expect(find.text('3 running, 1 failed'), findsOneWidget);
      expect(find.text('SLO burn alerts'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  });
}
