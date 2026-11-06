import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';

import '../../../helpers/phone_surface.dart';
import 'task_board_quick_actions_fixture.dart';
import 'task_board_row_actions_fixture.dart';

void main() {
  usePhoneSurface();
  setUpAll(CacheStore.instance.init);

  testWidgets('stuck quick-action save fails once the real-time cap passes', (
    tester,
  ) async {
    final repository = QuickActionsRepository();
    await openQuickActionsSheet(
      tester,
      workspaceCubit: rowActionsWorkspaceCubit(),
      repository: repository,
    );
    final barrier = Completer<void>();
    repository.updateBarrier = barrier.future;
    await tester.tap(quickActionTile('task-quick-priority-critical'));
    final elapsed = Stopwatch()..start();
    try {
      TestFailure? failure;
      try {
        await settleQuickActionMutation(
          tester,
          waitForCompletion: true,
          timeout: const Duration(milliseconds: 200),
        );
      } on TestFailure catch (error) {
        failure = error;
      }
      expect(failure?.message, 'quick-action save did not complete within 30s');
      expect(
        elapsed.elapsed,
        greaterThanOrEqualTo(const Duration(milliseconds: 200)),
      );
      expect(elapsed.elapsed, lessThan(const Duration(seconds: 10)));
      expect(readRowActionsCubit(tester).state.isMutating, isTrue);
    } finally {
      barrier.completeError(Exception('cancel stalled test save'));
      await tester.pumpAndSettle();
      await drainToasts(tester);
    }
  });
}
