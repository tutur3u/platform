import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';

import '../../../helpers/phone_surface.dart';
import 'task_board_quick_actions_fixture.dart';
import 'task_board_row_actions_fixture.dart';

/// One test in its own file: chained mutations wait on the process-wide
/// cache store, so no earlier test may leave writes queued in it.
void main() {
  usePhoneSurface();

  // Open the cache outside fake time so each mutation's cache invalidation
  // can finish inside the test.
  setUpAll(CacheStore.instance.init);

  testWidgets('consecutive edits save from the live task, sheet open', (
    tester,
  ) async {
    final repository = QuickActionsRepository();
    await openQuickActionsSheet(
      tester,
      workspaceCubit: rowActionsWorkspaceCubit(),
      repository: repository,
    );

    await tester.tap(quickActionTile('task-quick-priority-critical'));
    await settleQuickActionMutation(tester, waitForCompletion: true);
    await tester.tap(quickActionTile('task-quick-priority-low'));
    await settleQuickActionMutation(tester, waitForCompletion: true);

    expect(repository.sent.map((update) => update.priority), [
      'critical',
      'low',
    ]);
    // The second save carries the first save's result and every other
    // field, never the snapshot from when the sheet opened.
    expect(repository.sent.last.labelIds, ['label-1']);
    expect(repository.sent.last.endDate, DateTime(2026, 10, 24, 23, 59, 59));
    expect(
      tester.getSemantics(quickActionTile('task-quick-priority-low')),
      isSemantics(isSelected: true),
    );

    await tester.tap(quickActionTile('task-quick-labels'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Work').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save'));
    await settleQuickActionMutation(tester, waitForCompletion: true);

    await tester.tap(quickActionTile('task-quick-assignees'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Lan').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save'));
    await settleQuickActionMutation(tester, waitForCompletion: true);

    final labels = repository.sent[repository.sent.length - 2];
    final assignees = repository.sent.last;
    expect(labels.labelIds, unorderedEquals(['label-1', 'label-2']));
    expect(assignees.assigneeIds, ['user-1']);
    expect(assignees.labelIds, unorderedEquals(['label-1', 'label-2']));
    expect(assignees.priority, 'low');
    expect(quickActionTile('task-quick-assignees'), findsOneWidget);

    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
  });
}
