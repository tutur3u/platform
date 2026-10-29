import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/habits/cubit/habits_cubit.dart';
import 'package:mobile/features/habits/view/habits_page.dart';
import 'package:mobile/features/habits/widgets/habit_tracker_detail_sheet.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';
import 'habit_tracker_detail_fixture.dart';
import 'habits_auth_fixture.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late _MockWorkspaceCubit workspaceCubit;
  late DetailHabitTrackerRepository repository;

  Widget buildSurface({
    required WorkspaceCubit workspaceCubit,
    required Widget child,
  }) {
    return MultiBlocProvider(
      providers: [
        habitsAuthProvider(),
        BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
        BlocProvider(create: (_) => ShellChromeActionsCubit()),
      ],
      child: Stack(
        children: [
          child,
          const Align(
            alignment: Alignment.topRight,
            child: ShellInjectedActionsHost(matchedLocation: '/habits'),
          ),
        ],
      ),
    );
  }

  Future<void> pumpUi(WidgetTester tester, {int frames = 8}) async {
    for (var i = 0; i < frames; i++) {
      await tester.pump(const Duration(milliseconds: 60));
    }
  }

  setUp(() async {
    HabitsCubit.clearCache();
    await CacheStore.instance.clearScope();
    workspaceCubit = _MockWorkspaceCubit();
    repository = DetailHabitTrackerRepository();
    when(() => workspaceCubit.state).thenReturn(
      const WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: [
          Workspace(id: 'ws-personal', name: 'Personal', personal: true),
        ],
        currentWorkspace: Workspace(
          id: 'ws-personal',
          name: 'Personal',
          personal: true,
        ),
      ),
    );
    when(() => workspaceCubit.stream).thenAnswer((_) => const Stream.empty());
  });

  testWidgets('personal detail opens immediately and hides the leaderboard', (
    tester,
  ) async {
    repository.detailGate = Completer<void>();
    await tester.pumpApp(
      buildSurface(
        workspaceCubit: workspaceCubit,
        child: HabitsPage(repository: repository),
      ),
    );
    await pumpUi(tester);

    expect(repository.detailReads, 1);
    await tester.tap(find.text('Water').first);
    await pumpUi(tester, frames: 12);
    expect(find.byType(HabitTrackerDetailSheet), findsOneWidget);
    expect(repository.detailReads, 1);
    repository.detailGate!.complete();
    await pumpUi(tester);

    expect(find.widgetWithText(Tab, 'Overview'), findsOneWidget);
    expect(find.widgetWithText(Tab, 'Entries'), findsOneWidget);
    expect(find.widgetWithText(Tab, 'Leaderboard'), findsNothing);

    await tester.binding.handlePopRoute();
    await pumpUi(tester, frames: 12);

    repository.detailGate = Completer<void>();
    await tester.tap(find.text('Water').first);
    await pumpUi(tester, frames: 12);
    expect(repository.detailReads, 2);
    expect(find.byType(HabitTrackerDetailSheet), findsOneWidget);
    expect(find.widgetWithText(Tab, 'Entries'), findsOneWidget);
    expect(
      tester
          .widget<HabitTrackerDetailSheet>(find.byType(HabitTrackerDetailSheet))
          .isDetailRefreshing,
      isTrue,
    );

    await tester.binding.handlePopRoute();
    await pumpUi(tester, frames: 12);
    await tester.tap(find.text('Water').first);
    await pumpUi(tester, frames: 12);
    expect(repository.detailReads, 2);
    expect(find.byType(HabitTrackerDetailSheet), findsOneWidget);
    repository.detailGate!.complete();
    await pumpUi(tester);
    expect(
      tester
          .widget<HabitTrackerDetailSheet>(find.byType(HabitTrackerDetailSheet))
          .isDetailRefreshing,
      isFalse,
    );
    expect(find.widgetWithText(Tab, 'Leaderboard'), findsNothing);
    await tester.binding.handlePopRoute();
    await pumpUi(tester, frames: 12);
    expect(tester.takeException(), isNull);
  });
}
