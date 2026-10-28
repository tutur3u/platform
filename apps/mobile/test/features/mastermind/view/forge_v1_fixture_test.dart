import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';
import 'package:mobile/features/mastermind/presentation/home_model.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_item_tile.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_inbox_page.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_item_page.dart';
import 'package:mobile/features/mastermind/view/insights/mastermind_insights_page.dart';
import 'package:mobile/features/mastermind/view/mastermind_home_page.dart';
import 'package:mobile/features/mastermind/view/mastermind_sources_sheet.dart';
import 'package:mobile/features/mastermind/view/ship/mastermind_ship_page.dart';
import 'package:mobile/features/mastermind/view/work/mastermind_lane_page.dart';
import 'package:mobile/features/mastermind/view/work/mastermind_work_page.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_view_harness.dart';

final _fixture = File('test/fixtures/mastermind/forge_v1_redacted.json');

void main() {
  setUpAll(initializeDateFormatting);
  test('exact Forge fixture accepts companion paths and future root keys', () {
    final outcome = parseMastermindSnapshot(_fixture.readAsBytesSync());
    expect(
      outcome,
      isA<ParseAccepted>(),
      reason: outcome is ParseRejected ? outcome.path : null,
    );
    final snapshot = (outcome as ParseAccepted).snapshot;
    expect(snapshot.now.needsYou, hasLength(2));
    expect(
      snapshot.now.needsYou.whereType<NeedsYou>().every(
        (item) =>
            item.state == ItemState.open && item.body == 'Review the plan',
      ),
      isTrue,
    );
    expect(snapshot.resolvedItems, hasLength(2));
    expect(
      snapshot.environments.first.fields['deploy_status']!.status,
      'not_connected',
    );
    expect(
      snapshot
          .observability
          .usage
          .instances
          .first
          .weekly
          .fields['pacing']!
          .status,
      'not_connected',
    );
    expect(snapshot.observability.usage.gaps.single.reason, 'no_samples');
    final changed =
        jsonDecode(_fixture.readAsStringSync()) as Map<String, dynamic>;
    changed['future_additive'] = {'anything': true};
    (changed['work'] as Map<String, dynamic>)['counts'] = {
      'running': 8,
      'waiting': 3,
      'idle': 2,
    };
    final adapted =
        parseMastermindSnapshot(snapshotBytes(changed)) as ParseAccepted;
    expect(MastermindHomeModel.from(adapted.snapshot).laneCounts, {
      LaneState.running: 8,
      LaneState.waiting: 3,
      LaneState.idle: 2,
    });
  });

  for (final (name, page) in <(String, Widget)>[
    ('Home', const MastermindHomePage()),
    ('Inbox', const MastermindInboxPage()),
    ('Work', const MastermindWorkPage()),
    ('Ship', const MastermindShipPage()),
    ('Insights', const MastermindInsightsPage()),
    (
      'Ask detail',
      const MastermindItemPage(itemId: 'item-f23ae309c10a83c168e3'),
    ),
    (
      'Lane detail',
      const MastermindLanePage(laneId: 'item-cccccccccccccccccccc'),
    ),
    (
      'Sources',
      Builder(
        builder: (context) => TextButton(
          onPressed: () => showMastermindSourcesSheet(
            context,
            sources:
                (parseMastermindSnapshot(_fixture.readAsBytesSync())
                        as ParseAccepted)
                    .snapshot
                    .sources,
          ),
          child: const Text('Open sources'),
        ),
      ),
    ),
  ]) {
    testWidgets('Forge fixture renders $name', (tester) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = const Size(430, 12000);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      final harness = MastermindViewHarness(
        source: FakeHubSource(bytes: _fixture.readAsBytesSync()),
      );
      addTearDown(harness.dispose);
      await harness.setAccess(TestAccess.enabled);
      await tester.pumpApp(harness.wrap(page));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      switch (name) {
        case 'Home':
          expect(find.text('1 idle'), findsOneWidget);
        case 'Inbox':
          expect(find.byType(InboxItemTile), findsNWidgets(2));
          expect(find.text('Review the plan'), findsNWidgets(2));
          await tester.tap(find.text('Recently resolved'));
          await tester.pumpAndSettle();
          expect(find.text('Review the plan'), findsNWidgets(4));
        case 'Ask detail':
          expect(find.text('Review the plan'), findsOneWidget);
        case 'Lane detail':
          expect(find.text('idle'), findsOneWidget);
        case 'Sources':
          await tester.tap(find.text('Open sources'));
          await tester.pumpAndSettle();
          expect(find.text('Sources'), findsOneWidget);
          expect(tester.takeException(), isNull);
        case 'Work':
          expect(find.text('[Atlas] Mastermind'), findsOneWidget);
        case 'Ship':
          expect(find.textContaining('Not connected'), findsWidgets);
        case 'Insights':
          expect(find.textContaining('Not connected'), findsWidgets);
          expect(find.textContaining('No samples published'), findsOneWidget);
      }
      final words = tester
          .widgetList<Text>(find.byType(Text))
          .map((text) => text.data?.toLowerCase());
      expect(words, isNot(contains('unknown')));
    });
  }
}
