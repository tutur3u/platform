import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/sources/api_exception.dart';

import 'task_board_row_actions_fixture.dart';

/// Fails the first [failures] board reads, then serves the fixture board
/// with [unavailable] parts missing.
class _FlakyBoardRepository extends RowActionsRepository {
  _FlakyBoardRepository({this.failures = 0, this.unavailable = const {}});

  int failures;
  final Set<TaskBoardDetailPart> unavailable;
  int reads = 0;

  @override
  Future<TaskBoardDetail> getTaskBoardDetail(
    String wsId,
    String boardId,
  ) async {
    reads += 1;
    if (failures > 0) {
      failures -= 1;
      throw const ApiException(message: 'Bad gateway', statusCode: 502);
    }
    final detail = await super.getTaskBoardDetail(wsId, boardId);
    return detail.copyWith(unavailableParts: unavailable);
  }

  @override
  Future<TaskBoardDetail> reloadTaskBoardDetailParts(
    TaskBoardDetail detail,
  ) async => detail;
}

void main() {
  for (final reduceMotion in [false, true]) {
    final motion = reduceMotion ? 'reduced motion' : 'default motion';
    testWidgets('a board that cannot load shows the error and Retry loads it '
        'with $motion', (tester) async {
      tester.platformDispatcher.accessibilityFeaturesTestValue =
          FakeAccessibilityFeatures(disableAnimations: reduceMotion);
      addTearDown(
        tester.platformDispatcher.clearAccessibilityFeaturesTestValue,
      );
      final repository = _FlakyBoardRepository(failures: 1);
      // Its own board id keeps a cached board from hiding the failure.
      await pumpRowActionsBoard(
        tester,
        workspaceCubit: rowActionsWorkspaceCubit(),
        repository: repository,
        boardId: 'board-load-error-$reduceMotion',
      );

      // The error is an icon tile with no illustration, so it reads the
      // same and stays still in both motion settings.
      expect(find.byType(AppStateMessage), findsOneWidget);
      expect(find.byType(AppIconTile), findsOneWidget);
      expect(find.byType(AppIllustration), findsNothing);
      expect(
        find.text("Couldn't load board details right now"),
        findsOneWidget,
      );
      expect(find.text('Alpha task'), findsNothing);
      expect(tester.binding.hasScheduledFrame, isFalse);

      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();

      expect(repository.reads, 2);
      expect(find.byType(AppStateMessage), findsNothing);
      expect(find.text('Alpha task'), findsOneWidget);
    });
  }

  testWidgets('a board missing its workspace parts still renders', (
    tester,
  ) async {
    await pumpRowActionsBoard(
      tester,
      workspaceCubit: rowActionsWorkspaceCubit(),
      repository: _FlakyBoardRepository(
        unavailable: TaskBoardDetailPart.values.toSet(),
      ),
      boardId: 'board-partial',
    );

    expect(find.text("Couldn't load board details right now"), findsNothing);
    expect(find.text('Alpha task'), findsOneWidget);
    expect(find.text('Beta task'), findsOneWidget);
    // Let the bounded part retries finish so no timer outlives the test.
    for (var i = 0; i < 4; i++) {
      await tester.pump(const Duration(seconds: 20));
    }
  });
}
