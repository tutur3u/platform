import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/education/cubit/education_access_cubit.dart';
import 'package:mobile/features/habits/cubit/habits_access_cubit.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _MockHabitsAccessCubit extends MockCubit<HabitsAccessState>
    implements HabitsAccessCubit {}

class _MockEducationAccessCubit extends MockCubit<EducationAccessState>
    implements EducationAccessCubit {}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

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
      final experimentalAppsCubit = ExperimentalAppsCubit(
        settingsRepository: SettingsRepository(),
      );
      await experimentalAppsCubit.setModuleEnabled(
        moduleId: 'habits',
        enabled: true,
      );
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
      addTearDown(experimentalAppsCubit.close);

      late bool isVisible;
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<HabitsAccessCubit>.value(value: habitsAccessCubit),
            BlocProvider.value(value: experimentalAppsCubit),
          ],
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
      final experimentalAppsCubit = ExperimentalAppsCubit(
        settingsRepository: SettingsRepository(),
      );
      await experimentalAppsCubit.setModuleEnabled(
        moduleId: 'habits',
        enabled: true,
      );
      whenListen(
        habitsAccessCubit,
        const Stream<HabitsAccessState>.empty(),
        initialState: const HabitsAccessState(
          status: HabitsAccessStatus.loaded,
          wsId: 'team-1',
        ),
      );
      addTearDown(habitsAccessCubit.close);
      addTearDown(experimentalAppsCubit.close);

      late bool isVisible;
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<HabitsAccessCubit>.value(value: habitsAccessCubit),
            BlocProvider.value(value: experimentalAppsCubit),
          ],
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

  group('AppRegistry education module visibility', () {
    testWidgets(
      'shows education module when experiment and access are enabled',
      (
        tester,
      ) async {
        final educationAccessCubit = _MockEducationAccessCubit();
        final experimentalAppsCubit = ExperimentalAppsCubit(
          settingsRepository: SettingsRepository(),
        );
        await experimentalAppsCubit.setModuleEnabled(
          moduleId: 'education',
          enabled: true,
        );
        whenListen(
          educationAccessCubit,
          const Stream<EducationAccessState>.empty(),
          initialState: const EducationAccessState(
            status: EducationAccessStatus.loaded,
            enabled: true,
            wsId: 'team-1',
          ),
        );
        addTearDown(educationAccessCubit.close);
        addTearDown(experimentalAppsCubit.close);

        late bool isVisible;
        await tester.pumpApp(
          MultiBlocProvider(
            providers: [
              BlocProvider<EducationAccessCubit>.value(
                value: educationAccessCubit,
              ),
              BlocProvider.value(value: experimentalAppsCubit),
            ],
            child: Builder(
              builder: (context) {
                final module = AppRegistry.moduleById('education')!;
                isVisible = module.visibleIn(context);
                return const SizedBox.shrink();
              },
            ),
          ),
        );

        expect(isVisible, isTrue);
      },
    );

    testWidgets('hides education module without backend access', (
      tester,
    ) async {
      final educationAccessCubit = _MockEducationAccessCubit();
      final experimentalAppsCubit = ExperimentalAppsCubit(
        settingsRepository: SettingsRepository(),
      );
      await experimentalAppsCubit.setModuleEnabled(
        moduleId: 'education',
        enabled: true,
      );
      whenListen(
        educationAccessCubit,
        const Stream<EducationAccessState>.empty(),
        initialState: const EducationAccessState(
          status: EducationAccessStatus.loaded,
          wsId: 'team-1',
        ),
      );
      addTearDown(educationAccessCubit.close);
      addTearDown(experimentalAppsCubit.close);

      late bool isVisible;
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<EducationAccessCubit>.value(
              value: educationAccessCubit,
            ),
            BlocProvider.value(value: experimentalAppsCubit),
          ],
          child: Builder(
            builder: (context) {
              final module = AppRegistry.moduleById('education')!;
              isVisible = module.visibleIn(context);
              return const SizedBox.shrink();
            },
          ),
        ),
      );

      expect(isVisible, isFalse);
    });
  });

  group('AppRegistry workspace-secret module visibility', () {
    testWidgets('hides experimental modules listed by workspace flags', (
      tester,
    ) async {
      final workspaceCubit = _MockWorkspaceCubit();
      final educationAccessCubit = _MockEducationAccessCubit();
      final experimentalAppsCubit = ExperimentalAppsCubit(
        settingsRepository: SettingsRepository(),
      );
      for (final moduleId in ['cms', 'drive', 'meet', 'education']) {
        await experimentalAppsCubit.setModuleEnabled(
          moduleId: moduleId,
          enabled: true,
        );
      }
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: const WorkspaceState(
          status: WorkspaceStatus.loaded,
          currentWorkspace: Workspace(id: 'team-1'),
          hiddenModuleIds: ['cms', 'drive', 'meet'],
        ),
      );
      whenListen(
        educationAccessCubit,
        const Stream<EducationAccessState>.empty(),
        initialState: const EducationAccessState(
          status: EducationAccessStatus.loaded,
          enabled: true,
          wsId: 'team-1',
        ),
      );
      addTearDown(workspaceCubit.close);
      addTearDown(educationAccessCubit.close);
      addTearDown(experimentalAppsCubit.close);

      late List<String> visibleModuleIds;
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
            BlocProvider<EducationAccessCubit>.value(
              value: educationAccessCubit,
            ),
            BlocProvider.value(value: experimentalAppsCubit),
          ],
          child: Builder(
            builder: (context) {
              visibleModuleIds = AppRegistry.modules(
                context,
              ).map((module) => module.id).toList(growable: false);
              return const SizedBox.shrink();
            },
          ),
        ),
      );

      expect(visibleModuleIds, isNot(contains('cms')));
      expect(visibleModuleIds, isNot(contains('drive')));
      expect(visibleModuleIds, isNot(contains('meet')));
      expect(visibleModuleIds, contains('education'));
      expect(visibleModuleIds, contains('tasks'));
    });
  });
}
