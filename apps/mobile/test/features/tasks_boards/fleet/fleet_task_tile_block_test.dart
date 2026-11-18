import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_task_detail_card.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_task_meta.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_task_tile_block.dart';

import '../../../helpers/helpers.dart';

final _now = DateTime.utc(2026, 11, 18, 10);

FleetTaskMeta _meta(String block) => parseFleetTaskMeta(
  TaskBoardTask(
    id: 'task-1',
    listId: 'list-1',
    description: '<!-- fleet:v1 -->\n$block\n<!-- /fleet:v1 -->',
  ),
);

Future<void> _pump(WidgetTester tester, Widget child) async {
  tester.view
    ..physicalSize = const Size(390, 844)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpApp(Material(child: SingleChildScrollView(child: child)));
  await tester.pumpAndSettle();
}

void main() {
  group('FleetTaskTileBlock', () {
    testWidgets('shows status, owner, ETA, staleness and needs-you', (
      tester,
    ) async {
      final meta = _meta('''
status: waiting_review
owner: atlas
eta: 2026-11-18T12:00:00Z
last_update: 2026-11-18T09:30:00Z
needs_user: true
needs_user_reason: Approve the migration window
blocked_by: payments API key''');

      await _pump(tester, FleetTaskTileBlock(meta: meta, now: _now));

      expect(find.text('In review'), findsOneWidget);
      expect(find.text('atlas'), findsOneWidget);
      expect(find.text('in 2h'), findsOneWidget);
      expect(find.text('30m ago'), findsOneWidget);
      expect(find.text('Needs you'), findsOneWidget);
      expect(find.text('Approve the migration window'), findsOneWidget);
      expect(find.textContaining('payments API key'), findsNothing);
    });

    testWidgets('shows the blocked-by row when nothing needs the user', (
      tester,
    ) async {
      final meta = _meta('status: blocked\nblocked_by: payments API key');

      await _pump(tester, FleetTaskTileBlock(meta: meta, now: _now));

      expect(find.text('Blocked'), findsOneWidget);
      expect(find.textContaining('payments API key'), findsOneWidget);
      expect(find.text('Needs you'), findsNothing);
    });

    testWidgets('names the blocking task count when no reason is given', (
      tester,
    ) async {
      final meta = parseFleetTaskMeta(
        const TaskBoardTask(
          id: 'task-1',
          listId: 'list-1',
          relationshipSummary: TaskRelationshipSummary(blockedByCount: 2),
        ),
        listStatus: 'active',
      );

      await _pump(tester, FleetTaskTileBlock(meta: meta, now: _now));

      expect(find.text('Running'), findsOneWidget);
      expect(find.textContaining('2 blocking tasks'), findsOneWidget);
    });

    testWidgets('renders missing values as words', (tester) async {
      final meta = _meta('priority: low');

      await _pump(tester, FleetTaskTileBlock(meta: meta, now: _now));

      expect(find.text('No status'), findsOneWidget);
      expect(find.text('Unowned'), findsOneWidget);
      expect(find.text('No ETA'), findsOneWidget);
      expect(find.text('No update'), findsOneWidget);
    });

    testWidgets('marks an overdue ETA and a stale update', (tester) async {
      final meta = _meta('''
status: running
eta: 2026-11-18T07:00:00Z
last_update: 2026-11-16T10:00:00Z''');

      await _pump(tester, FleetTaskTileBlock(meta: meta, now: _now));

      expect(find.text('Running'), findsOneWidget);
      expect(find.text('3h overdue'), findsOneWidget);
      expect(find.text('2d ago · Stale'), findsOneWidget);
    });
  });

  group('FleetTaskDetailCard', () {
    testWidgets('shows the fields grid, the callout and every link', (
      tester,
    ) async {
      final meta = _meta('''
status: running
owner: iris
eta: 2026-11-18T12:00:00Z
last_update: 2026-11-18T09:50:00Z
needs_user: true
needs_user_reason: Pick a rollout date
links:
- pr: https://github.com/tutur3u/platform/pull/7245
- commit: 0123456789abcdef0123456789abcdef01234567
- thread: mastermind/atlas-4''');

      await _pump(tester, FleetTaskDetailCard(meta: meta, now: _now));

      for (final label in ['Status', 'Owner', 'ETA', 'Updated', 'Links']) {
        expect(find.text(label), findsOneWidget);
      }
      expect(find.text('Running'), findsOneWidget);
      expect(find.text('iris'), findsOneWidget);
      expect(find.text('Pick a rollout date'), findsOneWidget);
      expect(find.text('PR #7245'), findsOneWidget);
      expect(find.text('0123456'), findsOneWidget);
      expect(find.text('mastermind/atlas-4'), findsOneWidget);
    });

    testWidgets('omits the links section when there are none', (tester) async {
      await _pump(
        tester,
        FleetTaskDetailCard(meta: _meta('status: queued'), now: _now),
      );

      expect(find.text('Queued'), findsOneWidget);
      expect(find.text('Links'), findsNothing);
    });
  });
}
