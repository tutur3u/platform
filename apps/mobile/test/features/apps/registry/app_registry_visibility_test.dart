import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/education/cubit/education_access_cubit.dart';
import 'package:mobile/features/habits/cubit/habits_access_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

import '../../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _MockHabitsAccessCubit extends MockCubit<HabitsAccessState>
    implements HabitsAccessCubit {}

class _MockEducationAccessCubit extends MockCubit<EducationAccessState>
    implements EducationAccessCubit {}

void main() {
  testWidgets('ungated apps appear by default with one Documents entry', (
    tester,
  ) async {
    late List<String> visible;
    await tester.pumpApp(
      Builder(
        builder: (context) {
          visible = AppRegistry.modules(
            context,
          ).map((module) => module.id).toList();
          return const SizedBox.shrink();
        },
      ),
    );
    expect(
      visible,
      containsAll([
        'meet',
        'chat',
        'documents',
        'drive',
        'cms',
        'crm',
        'timer',
      ]),
    );
    expect(visible, isNot(contains('notes')));
    expect(visible, isNot(contains('mail')));
    expect(visible, isNot(contains('inventory')));
    expect(visible, isNot(contains('education')));
    expect(visible, isNot(contains('habits')));
    expect(AppRegistry.moduleById('notes')?.id, 'documents');
    expect(
      AppRegistry.moduleFromLocation('/notes?noteId=private')?.id,
      'documents',
    );
    expect(AppRegistry.moduleFromLocation(Routes.notes)?.id, 'documents');
  });

  for (final (hidden, accessibleViews) in [
    (<String>[], [Routes.documents, Routes.notes]),
    (['documents'], [Routes.notes]),
    (['notes'], [Routes.documents]),
    (['documents', 'notes'], <String>[]),
  ]) {
    testWidgets('Documents views respect workspace flags $hidden', (
      tester,
    ) async {
      final workspace = _MockWorkspaceCubit();
      whenListen(
        workspace,
        const Stream<WorkspaceState>.empty(),
        initialState: WorkspaceState(hiddenModuleIds: hidden),
      );
      addTearDown(workspace.close);
      late bool visible;
      late List<MiniAppNavItem> items;
      await tester.pumpApp(
        BlocProvider<WorkspaceCubit>.value(
          value: workspace,
          child: Builder(
            builder: (context) {
              final module = AppRegistry.moduleById('documents')!;
              visible = module.visibleIn(context);
              items = module.miniAppNavItemsFor(context);
              return const SizedBox.shrink();
            },
          ),
        ),
      );
      expect(visible, accessibleViews.isNotEmpty);
      expect(items.map((item) => item.route), accessibleViews);
      if (items.length == 2) {
        expect(miniNavSelectedIndex(Routes.notes, items), 1);
        expect(
          miniNavSelectedIndex(Routes.documentDetailPath('doc-1'), items),
          0,
        );
      }
    });
  }

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
        MultiBlocProvider(
          providers: [
            BlocProvider<HabitsAccessCubit>.value(value: habitsAccessCubit),
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
        MultiBlocProvider(
          providers: [
            BlocProvider<HabitsAccessCubit>.value(value: habitsAccessCubit),
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
    testWidgets('shows education module when access is enabled', (
      tester,
    ) async {
      final educationAccessCubit = _MockEducationAccessCubit();
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

      late bool isVisible;
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<EducationAccessCubit>.value(
              value: educationAccessCubit,
            ),
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
    });

    testWidgets('hides education module without backend access', (
      tester,
    ) async {
      final educationAccessCubit = _MockEducationAccessCubit();
      whenListen(
        educationAccessCubit,
        const Stream<EducationAccessState>.empty(),
        initialState: const EducationAccessState(
          status: EducationAccessStatus.loaded,
          wsId: 'team-1',
        ),
      );
      addTearDown(educationAccessCubit.close);

      late bool isVisible;
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<EducationAccessCubit>.value(
              value: educationAccessCubit,
            ),
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
    testWidgets('hides modules listed by workspace flags', (tester) async {
      final workspaceCubit = _MockWorkspaceCubit();
      final educationAccessCubit = _MockEducationAccessCubit();
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

      late List<String> visibleModuleIds;
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
            BlocProvider<EducationAccessCubit>.value(
              value: educationAccessCubit,
            ),
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
