import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/habits/cubit/habits_cubit.dart';
import 'package:mobile/features/habits/view/habits_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';
import 'habits_auth_fixture.dart';
import 'habits_page_test.dart' show FakeHabitTrackerRepository;

class _WorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

void main() {
  testWidgets('a personal check habit logs once without opening a form', (
    tester,
  ) async {
    await tester.runAsync(CacheStore.instance.clearScope);
    HabitsCubit.clearCache();
    final workspaceCubit = _WorkspaceCubit();
    addTearDown(workspaceCubit.close);
    when(() => workspaceCubit.stream).thenAnswer((_) => const Stream.empty());
    final repository = FakeHabitTrackerRepository(
      tracker: HabitTracker(
        id: 'tracker-1',
        wsId: 'ws-1',
        name: 'Stretch',
        color: 'CYAN',
        icon: 'Repeat',
        trackingMode: HabitTrackerTrackingMode.eventLog,
        targetPeriod: HabitTrackerTargetPeriod.daily,
        targetOperator: HabitTrackerTargetOperator.gte,
        targetValue: 1,
        primaryMetricKey: 'done',
        aggregationStrategy: HabitTrackerAggregationStrategy.booleanAny,
        inputSchema: const [
          HabitTrackerFieldSchema(
            key: 'done',
            label: 'Done',
            type: HabitTrackerFieldType.boolean,
            required: true,
          ),
        ],
        quickAddValues: const [],
        freezeAllowance: 1,
        recoveryWindowPeriods: 1,
        startDate: '2026-03-25',
        isActive: true,
        createdAt: DateTime(2026, 3, 25),
        updatedAt: DateTime(2026, 3, 25),
        composerMode: HabitTrackerComposerMode.quickCheck,
      ),
    );
    when(() => workspaceCubit.state).thenReturn(
      const WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: Workspace(id: 'ws-1', personal: true),
      ),
    );
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          habitsAuthProvider(),
          BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
        ],
        child: HabitsPage(repository: repository),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Complete now'));
    await tester.pumpAndSettle();
    expect(repository.submittedEntries.single.values, {'done': true});
    expect(find.byType(TextField), findsNothing);
  });
}
