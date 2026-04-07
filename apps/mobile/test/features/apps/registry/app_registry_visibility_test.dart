import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/habits/cubit/habits_access_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

import '../../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _MockHabitsAccessCubit extends MockCubit<HabitsAccessState>
    implements HabitsAccessCubit {}

void main() {
  group('AppRegistry timer mini nav visibility', () {
    testWidgets('hides requests in personal workspace', (tester) async {
      final workspaceCubit = _MockWorkspaceCubit();
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: const WorkspaceState(
          status: WorkspaceStatus.loaded,
          currentWorkspace: Workspace(id: 'personal-1', personal: true),
        ),
      );
      addTearDown(workspaceCubit.close);

      late List<String> routes;
      await tester.pumpApp(
        BlocProvider<WorkspaceCubit>.value(
          value: workspaceCubit,
          child: Builder(
            builder: (context) {
              final timer = AppRegistry.moduleById('timer')!;
              routes = timer
                  .miniAppNavItemsFor(context)
                  .map((item) => item.route)
                  .toList(growable: false);
              return const SizedBox.shrink();
            },
          ),
        ),
      );

      expect(routes, isNot(contains(Routes.timerRequests)));
    });

    testWidgets('shows requests in non-personal workspace', (tester) async {
      final workspaceCubit = _MockWorkspaceCubit();
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: const WorkspaceState(
          status: WorkspaceStatus.loaded,
          currentWorkspace: Workspace(id: 'team-1'),
        ),
      );
      addTearDown(workspaceCubit.close);

      late List<String> routes;
      await tester.pumpApp(
        BlocProvider<WorkspaceCubit>.value(
          value: workspaceCubit,
          child: Builder(
            builder: (context) {
              final timer = AppRegistry.moduleById('timer')!;
              routes = timer
                  .miniAppNavItemsFor(context)
                  .map((item) => item.route)
                  .toList(growable: false);
              return const SizedBox.shrink();
            },
          ),
        ),
      );

      expect(routes, contains(Routes.timerRequests));
    });

    testWidgets('reacts immediately to workspace switch', (tester) async {
      final workspaceCubit = _MockWorkspaceCubit();
      whenListen(
        workspaceCubit,
        Stream<WorkspaceState>.fromIterable(const [
          WorkspaceState(
            status: WorkspaceStatus.loaded,
            currentWorkspace: Workspace(id: 'team-1'),
          ),
          WorkspaceState(
            status: WorkspaceStatus.loaded,
            currentWorkspace: Workspace(id: 'personal-1', personal: true),
          ),
        ]),
        initialState: const WorkspaceState(
          status: WorkspaceStatus.loaded,
          currentWorkspace: Workspace(id: 'team-1'),
        ),
      );
      addTearDown(workspaceCubit.close);

      await tester.pumpApp(
        BlocProvider<WorkspaceCubit>.value(
          value: workspaceCubit,
          child: Builder(
            builder: (context) {
              final timer = AppRegistry.moduleById('timer')!;
              final routes = timer.miniAppNavItemsFor(context);
              final hasRequests = routes.any(
                (item) => item.route == Routes.timerRequests,
              );
              return Text(hasRequests ? 'has-requests' : 'no-requests');
            },
          ),
        ),
      );

      expect(find.text('has-requests'), findsOneWidget);

      await tester.pump();
      expect(find.text('no-requests'), findsOneWidget);
    });
  });

  group('AppRegistry habits module visibility', () {
    testWidgets('shows habits module when habits access is enabled', (
      tester,
    ) async {
      final habitsAccessCubit = _MockHabitsAccessCubit();
      whenListen(
        habitsAccessCubit,
        const Stream<HabitsAccessState>.empty(),
        initialState: const HabitsAccessState(
          status: HabitsAccessStatus.loaded,
          enabled: true,
          wsId: 'team-1',
        ),
      );
      addTearDown(habitsAccessCubit.close);

      late bool isVisible;
      await tester.pumpApp(
        BlocProvider<HabitsAccessCubit>.value(
          value: habitsAccessCubit,
          child: Builder(
            builder: (context) {
              final module = AppRegistry.moduleById('habits')!;
              isVisible = module.visibleIn(context);
              return const SizedBox.shrink();
            },
          ),
        ),
      );

      expect(isVisible, isTrue);
    });

    testWidgets('hides habits module when habits access is disabled', (
      tester,
    ) async {
      final habitsAccessCubit = _MockHabitsAccessCubit();
      whenListen(
        habitsAccessCubit,
        const Stream<HabitsAccessState>.empty(),
        initialState: const HabitsAccessState(
          status: HabitsAccessStatus.loaded,
          wsId: 'team-1',
        ),
      );
      addTearDown(habitsAccessCubit.close);

      late bool isVisible;
      await tester.pumpApp(
        BlocProvider<HabitsAccessCubit>.value(
          value: habitsAccessCubit,
          child: Builder(
            builder: (context) {
              final module = AppRegistry.moduleById('habits')!;
              isVisible = module.visibleIn(context);
              return const SizedBox.shrink();
            },
          ),
        ),
      );

      expect(isVisible, isFalse);
    });
  });
}
