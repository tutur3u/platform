import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';

import '../../../helpers/phone_surface.dart';
import 'task_board_row_actions_fixture.dart';
import 'task_board_task_detail_fixture.dart';

/// One test in its own file: chained creates wait on the process-wide cache
/// store, so no earlier test may leave writes queued in it.
void main() {
  usePhoneSurface();

  // Open the cache outside fake time so each create's cache invalidation
  // can finish inside the test.
  setUpAll(CacheStore.instance.init);

  /// Waits in bounded real time for the save; the Create button's spinner
  /// keeps frames scheduled until it finishes, so pumpAndSettle cannot.
  Future<void> waitForSave(WidgetTester tester) async {
    await tester.pump();
    final cubit = readRowActionsCubit(tester);
    for (var i = 0; i < 300 && cubit.state.isMutating; i++) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 20)),
      );
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(cubit.state.isMutating, isFalse);
    await tester.pump();
  }

  late TaskDetailRepository repository;

  setUp(() => repository = TaskDetailRepository());

  testWidgets('Create more keeps the form open for the next task', (
    tester,
  ) async {
    await pumpRowActionsBoard(
      tester,
      workspaceCubit: rowActionsWorkspaceCubit(),
      repository: repository,
    );
    await openTaskCreateForm(tester);

    await tester.tap(find.byKey(const ValueKey('task-editor-create-more')));
    await tester.enterText(find.byType(EditableText).first, 'First');
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('task-editor-save')));
    await waitForSave(tester);

    expect(repository.created, ['First']);
    expect(find.byKey(const ValueKey('task-editor-save')), findsOneWidget);
    expect(
      tester
          .widget<EditableText>(find.byType(EditableText).first)
          .controller
          .text,
      isEmpty,
    );

    // Without Create more, saving closes the form without asking.
    await tester.tap(find.byKey(const ValueKey('task-editor-create-more')));
    await tester.enterText(find.byType(EditableText).first, 'Second');
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('task-editor-save')));
    await waitForSave(tester);
    await tester.pumpAndSettle();

    expect(repository.created, ['First', 'Second']);
    expect(find.byKey(const ValueKey('task-editor-save')), findsNothing);
    expect(find.text('Discard changes?'), findsNothing);
    await drainToasts(tester);
  });
}
