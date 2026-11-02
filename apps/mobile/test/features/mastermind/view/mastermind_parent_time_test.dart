import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_item_tile.dart';
import 'package:mobile/features/mastermind/view/ship/ship_environment_tile.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_clock.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_home_fixture.dart';
import '../../../helpers/mastermind_snapshot_builder.dart';
import '../../../helpers/mastermind_view_harness.dart';

void main() {
  testWidgets('inbox spoken age ticks and exact-time action keeps row tap', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    final harness = MastermindViewHarness();
    addTearDown(harness.dispose);
    final json = MastermindSnapshotBuilder.defaults().toJson();
    final need =
        ((json['now'] as Map<String, dynamic>)['needs_you'] as List).first
            as Map<String, dynamic>;
    need['created_at'] = '2026-01-31T17:30:00+00:00';
    final item = parsedSnapshot(json).now.needsYou.whereType<NeedsYou>().first;
    var now = item.createdAt!.add(const Duration(minutes: 2));
    await tester.pumpApp(
      harness.wrap(
        MastermindClockScope(
          now: () => now,
          child: InboxItemTile(item: item, now: now),
        ),
      ),
    );
    final row = find.bySemanticsLabel(RegExp('2 minutes ago'));
    expect(row, findsOneWidget);
    final node = tester.getSemantics(row);
    expect(node.getSemanticsData().hasAction(SemanticsAction.tap), isTrue);
    final actions = node.getSemanticsData().customSemanticsActionIds!;
    expect(actions, hasLength(1));
    expect(
      CustomSemanticsAction.getAction(actions.single)?.label,
      'Show exact time',
    );
    node.owner!.performAction(
      node.id,
      SemanticsAction.customAction,
      actions.single,
    );
    await tester.pump();
    expect(find.textContaining('GMT+7'), findsOneWidget);
    now = now.add(const Duration(minutes: 5));
    await tester.pump(MastermindClock.period);
    expect(find.bySemanticsLabel(RegExp('7 minutes ago')), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('2 minutes ago')), findsNothing);
    handle.dispose();
  });

  testWidgets('ship parent spoken release and checked ages tick', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    final json = MastermindSnapshotBuilder.defaults().toJson();
    final environment =
        (json['environments'] as List).first as Map<String, dynamic>;
    environment['age_seconds'] = 0;
    environment['observed_at'] = '2026-01-31T17:30:00+00:00';
    final snapshot = parsedSnapshot(json);
    var now = snapshot.generatedAt.add(const Duration(minutes: 2));
    await tester.pumpApp(
      MastermindClockScope(
        now: () => now,
        child: ShipEnvironmentTile(
          row: snapshot.environments.first,
          asOf: snapshot.generatedAt,
        ),
      ),
    );
    final parent = find.bySemanticsLabel(RegExp('Released.*Checked'));
    expect(parent, findsOneWidget);
    expect(
      tester.getSemantics(parent).label,
      contains('Released 2 minutes ago'),
    );
    expect(
      tester.getSemantics(parent).label,
      contains('Checked 2 minutes ago'),
    );
    now = now.add(const Duration(minutes: 5));
    await tester.pump(MastermindClock.period);
    expect(
      tester.getSemantics(parent).label,
      contains('Released 7 minutes ago'),
    );
    expect(
      tester.getSemantics(parent).label,
      contains('Checked 7 minutes ago'),
    );
    handle.dispose();
  });
}
