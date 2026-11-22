import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_today_outcomes_panel.dart';

import '../../../helpers/design_render_harness.dart';

final _now = DateTime.utc(2026, 11, 22, 2, 59);

Map<String, dynamic> _lane(
  String id,
  String machine,
  String state,
  String updatedAt, {
  String? resolution,
}) => {
  'id': id,
  'title': 'Lane $id',
  'machineId': machine,
  'state': state,
  'updatedAt': updatedAt,
  'resolution': ?resolution,
};

/// The shape published at 09:59 ICT 2026-11-22: classified outcomes only for
/// the publishing Mac, none for its linked machines.
FleetSnapshot _snapshot({
  Map<String, dynamic>? m4Outcomes,
  Map<String, dynamic> counts = const {'running': 4, 'idle': 2, 'failed': 4},
  List<Map<String, dynamic>> extraLanes = const [],
  String? macStudioSeenAt,
}) => FleetSnapshot.parse({
  'receivedAt': '2026-11-22T02:58:40.000Z',
  'state': {
    'version': 1,
    'generatedAt': '2026-11-22T02:58:38.000Z',
    'orchestrator': {'label': 'Iris', 'state': 'running'},
    'counts': counts,
    'machines': [
      {
        'id': 'skr-m4',
        'label': 'M4',
        'status': 'online',
        'todayOutcomes':
            m4Outcomes ??
            {
              'kind': 'complete',
              'observedAt': '2026-11-22T02:58:30.000Z',
              'dayStart': '2026-11-21T17:00:00.000Z',
              'real': 2,
              'quotaRecovered': 1,
              'quotaUnrecovered': 0,
              'unclassified': 0,
            },
      },
      {
        'id': 'macstudio1',
        'label': 'MacStudio1',
        'status': 'online',
        'lastSeenAt': ?macStudioSeenAt,
      },
      {'id': 'macbook1', 'label': 'Macbook1', 'status': 'stale'},
      {'id': 'skora-macbook-m3-pro', 'label': 'M3 Pro', 'status': 'offline'},
    ],
    'lanes': [
      _lane('a', 'macstudio1', 'running', '2026-11-22T02:50:00.000Z'),
      _lane('b', 'macstudio1', 'failed', '2026-11-22T02:45:36.000Z'),
      _lane('c', 'macstudio1', 'failed', '2026-11-22T01:11:24.000Z'),
      // Failed yesterday (ICT): not today's.
      _lane('d', 'macstudio1', 'failed', '2026-11-21T16:59:00.000Z'),
      _lane(
        'e',
        'macstudio1',
        'idle',
        '2026-11-22T00:10:00.000Z',
        resolution: 'recovered',
      ),
      // A duplicate launch is not a recovery.
      _lane(
        'f',
        'macstudio1',
        'idle',
        '2026-11-22T00:12:00.000Z',
        resolution: 'cancelled',
      ),
      _lane('g', 'macbook1', 'failed', '2026-11-22T02:00:00.000Z'),
      ...extraLanes,
    ],
  },
});

FleetMachine _machine(FleetSnapshot snapshot, String id) =>
    snapshot.machines.firstWhere((machine) => machine.id == id);

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#fleet-sync
void main() {
  test('the ICT day starts at 17:00 UTC the day before', () {
    expect(fleetIctDayStart(_now), DateTime.utc(2026, 11, 21, 17));
    expect(
      fleetIctDayStart(DateTime.utc(2026, 11, 22, 17)),
      DateTime.utc(2026, 11, 22, 17),
    );
  });

  test('a linked machine counts its own failed and retried lanes today', () {
    final snapshot = _snapshot();
    final outcome = fleetMachineOutcome(
      snapshot,
      _machine(snapshot, 'macstudio1'),
      _now,
    );
    expect(outcome, isA<FleetLaneOutcome>());
    outcome as FleetLaneOutcome;
    expect(outcome.failed, 2);
    expect(outcome.retried, 1);
  });

  test('a running lane is not a retried failure', () {
    final snapshot = _snapshot(
      counts: const {'running': 5, 'idle': 2, 'failed': 4},
      extraLanes: [
        _lane(
          'h',
          'macstudio1',
          'running',
          '2026-11-22T02:55:00.000Z',
          resolution: 'recovered',
        ),
      ],
    );
    final outcome =
        fleetMachineOutcome(snapshot, _machine(snapshot, 'macstudio1'), _now)
            as FleetLaneOutcome;
    expect(outcome.retried, 1);
    expect(outcome.partial, isFalse);
  });

  test('counts cut by the lane cap read as partial', () {
    // Five failed lanes fleet-wide, four listed, all from today or later
    // than the oldest listed one, so today's may be incomplete.
    final cut = _snapshot(counts: const {'running': 4, 'idle': 2, 'failed': 6});
    final outcome =
        fleetMachineOutcome(cut, _machine(cut, 'macstudio1'), _now)
            as FleetLaneOutcome;
    expect(outcome.partial, isFalse, reason: 'a listed failure predates today');
    final today = _snapshot(
      counts: const {'running': 4, 'idle': 3, 'failed': 4},
    );
    expect(
      (fleetMachineOutcome(today, _machine(today, 'macstudio1'), _now)
              as FleetLaneOutcome)
          .partial,
      isTrue,
      reason: 'an idle lane was cut and every listed idle lane is from today',
    );
  });

  test('a full snapshot of active lanes reads as partial coverage', () {
    // A peer with as many running lanes as the cap lists none of its
    // failures, and its failed total never reaches the snapshot.
    final full = FleetSnapshot.parse({
      'receivedAt': '2026-11-22T02:58:40.000Z',
      'state': {
        'version': 1,
        'generatedAt': '2026-11-22T02:58:38.000Z',
        'orchestrator': {'label': 'Iris', 'state': 'running'},
        'counts': {'running': 300},
        'machines': [
          {'id': 'macstudio1', 'label': 'MacStudio1', 'status': 'online'},
        ],
        'lanes': [
          for (var i = 0; i < 300; i++)
            _lane('r$i', 'macstudio1', 'running', '2026-11-22T02:50:00.000Z'),
        ],
      },
    });
    final outcome =
        fleetMachineOutcome(full, full.machines.single, _now)
            as FleetLaneOutcome;
    expect(outcome.failed, 0);
    expect(outcome.partial, isTrue);
  });

  testWidgets('a peer last seen past the stale limit shows Stale', (
    tester,
  ) async {
    DesignRender.setSize(tester, DesignRender.sizes['phone']!);
    final (settings, brightness) = DesignRender.themes['light']!;
    await tester.pumpWidget(
      DesignRenderApp(
        settings: settings,
        brightness: brightness,
        child: FleetTodayOutcomesPanel(
          snapshot: _snapshot(macStudioSeenAt: '2026-11-22T02:50:00.000Z'),
          now: _now,
        ),
      ),
    );
    await tester.pump();
    // MacStudio1 (silent for nine minutes) and Macbook1 (cached listing).
    expect(find.text('Stale'), findsNWidgets(2));
  });

  test('the publishing Mac keeps its classified outcomes', () {
    final snapshot = _snapshot();
    expect(
      fleetMachineOutcome(snapshot, _machine(snapshot, 'skr-m4'), _now),
      isA<FleetClassifiedOutcome>(),
    );
  });

  test('outcomes from another day are not shown as today', () {
    final snapshot = _snapshot(
      m4Outcomes: {
        'kind': 'complete',
        'observedAt': '2026-11-21T16:58:00.000Z',
        'dayStart': '2026-11-20T17:00:00.000Z',
        'real': 4,
        'quotaRecovered': 0,
        'quotaUnrecovered': 0,
        'unclassified': 0,
      },
    );
    final outcome = fleetMachineOutcome(
      snapshot,
      _machine(snapshot, 'skr-m4'),
      _now,
    );
    expect(outcome, isA<FleetNoOutcome>());
    expect((outcome as FleetNoOutcome).offline, isFalse);
  });

  testWidgets('no online machine reads as unavailable', (tester) async {
    DesignRender.setSize(tester, DesignRender.sizes['phone']!);
    final (settings, brightness) = DesignRender.themes['light']!;
    await tester.pumpWidget(
      DesignRenderApp(
        settings: settings,
        brightness: brightness,
        child: FleetTodayOutcomesPanel(snapshot: _snapshot(), now: _now),
      ),
    );
    await tester.pump();

    expect(find.text('Unavailable'), findsNothing);
    expect(
      find.text(
        '2 failures · 1 quota stops auto-recovered · 0 quota stops with no '
        'automatic recovery · 0 unclassified',
      ),
      findsOneWidget,
    );
    expect(
      find.text(
        '2 failed · 1 retried today. Counted from lanes: this linked '
        'machine does not share failure kinds.',
      ),
      findsOneWidget,
    );
    expect(
      find.text(
        '1 failed · 0 retried today. Counted from lanes: this linked '
        'machine does not share failure kinds.',
      ),
      findsOneWidget,
    );
    expect(find.text('Offline. Outcomes are not collected.'), findsOneWidget);
    // Macbook1's listing is cached from a missed probe.
    expect(find.text('Stale'), findsOneWidget);
  });
}
