import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_recovered_card.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_today_page.dart';

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/mastermind_fleet_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

Map<String, dynamic> _withCounts(Map<String, dynamic> counts) {
  final json = fleetSampleJson();
  (json['state'] as Map<String, dynamic>)['counts'] = counts;
  return json;
}

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#fleet-sync
void main() {
  late FakeFleetSource source;
  late MastermindViewHarness harness;
  late DateTime clock;

  setUp(() async {
    clock = fleetTestNow;
    source = FakeFleetSource();
    harness = MastermindViewHarness(
      fleet: FleetCubit(
        source: source,
        clock: () => clock,
        timer: inertFleetTimer,
      ),
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
        child: harness.wrap(FleetTodayPage(now: () => clock)),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  testWidgets('failed counts only real failures; the rest has its own card', (
    tester,
  ) async {
    source.json = _withCounts({
      'running': 9,
      'waiting': 0,
      'queued': 0,
      'idle': 45,
      'failed': 3,
      'recovered': 2,
      'quotaRecovered': 6,
      'cancelled': 31,
    });
    await pump(tester);
    expect(find.text('9 running, 3 failed'), findsOneWidget);
    final failed = tester.widget<AppStatTile>(
      find.byWidgetPredicate((w) => w is AppStatTile && w.label == 'Failed'),
    );
    expect(failed.value, '3');
    expect(find.text('Recovered or cancelled'), findsOneWidget);
    expect(find.text('39'), findsOneWidget);
    expect(
      find.text('31 duplicates · 6 after quota · 2 retried OK'),
      findsOneWidget,
    );
  });

  testWidgets('no recovered card without the split or when it is zero', (
    tester,
  ) async {
    await pump(tester);
    expect(find.byType(FleetRecoveredCard), findsNothing);
    expect(find.text('3 running, 1 failed'), findsOneWidget);
  });

  testWidgets('an offline phone shows when its data was read', (tester) async {
    await pump(tester);
    expect(find.text('Live · published 2 min ago'), findsOneWidget);
    clock = clock.add(const Duration(minutes: 30));
    source.fetchError = const ApiException.transport(message: 'offline');
    await harness.runtime.fleet.refresh();
    await tester.pump();
    expect(find.text('Phone offline'), findsOneWidget);
    // 03:02 UTC, the last successful read, is 10:02 in ICT.
    expect(
      find.text('Showing 10:02. The fleet may have moved on.'),
      findsOneWidget,
    );
    expect(find.text('Publisher paused'), findsNothing);
  });
}
