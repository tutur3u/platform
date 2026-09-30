import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

class _Tasks extends TaskRepository {
  @override
  Future<TaskBoardDetail> getTaskBoardDetail(
    String wsId,
    String boardId,
  ) async => TaskBoardDetail(id: boardId, wsId: wsId, name: 'Synthetic Tasks');
}

Future<void> _pump(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  late AppTabCubit apps;
  late ExperimentalAppsCubit experiments;
  late _Auth auth;
  late _Workspaces workspaces;
  late _Profile profile;
  late GoRouter router;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    apps = AppTabCubit(settingsRepository: SettingsRepository());
    experiments = ExperimentalAppsCubit(
      settingsRepository: SettingsRepository(),
    );
    await experiments.load();
    auth = _Auth();
    workspaces = _Workspaces();
    profile = _Profile();
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.unauthenticated(),
    );
    whenListen(
      workspaces,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(
        currentWorkspace: Workspace(id: 'synthetic-personal', personal: true),
      ),
    );
    whenListen(
      profile,
      const Stream<ShellProfileState>.empty(),
      initialState: const ShellProfileState(),
    );
    router = GoRouter(
      initialLocation: Routes.apps,
      routes: [
        ShellRoute(
          builder: (context, state, child) => ShellPage(
            matchedLocation: state.uri.path,
            enableDebugLogs: false,
            child: child,
          ),
          routes: [
            GoRoute(path: Routes.apps, builder: (_, _) => const SizedBox()),
            GoRoute(path: Routes.home, builder: (_, _) => const SizedBox()),
            GoRoute(path: Routes.tasks, builder: (_, _) => const SizedBox()),
            GoRoute(path: Routes.calendar, builder: (_, _) => const SizedBox()),
            GoRoute(
              path: Routes.taskBoards,
              builder: (_, _) => const SizedBox(),
            ),
            GoRoute(
              path: Routes.taskBoardDetail,
              builder: (_, state) => TaskBoardDetailPage(
                boardId: state.pathParameters['boardId']!,
                taskRepository: _Tasks(),
              ),
            ),
          ],
        ),
      ],
    );
  });
  tearDown(() async {
    router.dispose();
    await apps.close();
    await experiments.close();
    await auth.close();
    await workspaces.close();
    await profile.close();
  });

  Future<void> mount(WidgetTester tester) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(430, 844);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: apps),
          BlocProvider.value(value: experiments),
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspaces),
          BlocProvider<ShellProfileCubit>.value(value: profile),
          BlocProvider(create: (_) => AssistantChromeCubit()),
          BlocProvider(create: (_) => ShellMiniNavCubit()),
          BlocProvider(create: (_) => ShellTitleOverrideCubit()),
          BlocProvider(create: (_) => ShellChromeActionsCubit()),
        ],
        child: shad.ShadcnApp.router(
          theme: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
          localizationsDelegates: const [
            ...AppLocalizations.localizationsDelegates,
            shad.ShadcnLocalizations.delegate,
          ],
          supportedLocales: AppLocalizations.supportedLocales,
          builder: ShadcnMaterialBridge.appBuilder,
          routerConfig: router,
        ),
      ),
    );
    await _pump(tester);
  }

  for (final origin in [Routes.apps, Routes.home]) {
    for (final systemBack in [false, true]) {
      testWidgets('personal Tasks ${systemBack ? 'system' : 'dock'} back '
          'exits to $origin', (tester) async {
        await mount(tester);
        router.go(origin);
        await _pump(tester);
        router.go(Routes.taskBoardDetailPath('synthetic-board'));
        await _pump(tester);
        expect(
          tester
              .widget<ShellMiniNav>(find.byType(ShellMiniNav))
              .deepLinkBackRoute,
          Routes.apps,
        );
        if (systemBack) {
          await tester.binding.handlePopRoute();
        } else {
          await tester.tap(
            find.byKey(
              const ValueKey(
                'injected-mini-nav-task-board-mini-nav-synthetic-board-back',
              ),
            ),
          );
        }
        await _pump(tester);
        expect(router.routeInformationProvider.value.uri.path, origin);
        expect(tester.takeException(), isNull);
      });
    }
  }
  for (final tapIcon in [false, true]) {
    testWidgets('selecting an app ${tapIcon ? 'icon' : 'label'} exits reorder '
        'and navigates normally', (tester) async {
      await mount(tester);
      await tester.longPress(find.text('Tasks'));
      await _pump(tester);
      expect(find.byTooltip('Hide app'), findsWidgets);
      final target = tapIcon
          ? find
                .descendant(
                  of: find.byKey(const ValueKey('apps-grid-position-calendar')),
                  matching: find.byType(Icon),
                )
                .first
          : find.text('Calendar');
      await tester.tap(target);
      await _pump(tester);
      expect(router.routeInformationProvider.value.uri.path, Routes.calendar);
      router.go(Routes.apps);
      await _pump(tester);
      expect(find.byTooltip('Hide app'), findsNothing);
    });
  }
  for (final destination in [Routes.tasks, Routes.home]) {
    testWidgets('navigating to $destination resets retained Apps reorder', (
      tester,
    ) async {
      await mount(tester);
      final state = tester.state(find.byType(AppsHubPage));
      await tester.longPress(find.text('Tasks'));
      await _pump(tester);
      router.go(destination);
      await _pump(tester);
      router.go(Routes.apps);
      await _pump(tester);
      expect(tester.state(find.byType(AppsHubPage)), same(state));
      expect(find.byTooltip('Hide app'), findsNothing);
    });
  }
  testWidgets('empty icon margins and grid gaps never select an app', (
    tester,
  ) async {
    await mount(tester);
    final cell = tester.getRect(
      find.byKey(const ValueKey('apps-grid-position-calendar')),
    );
    await tester.tapAt(cell.topLeft + const Offset(2, 70));
    await _pump(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.apps);
    await tester.tapAt(Offset(cell.left - 6, cell.top + 70));
    await _pump(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.apps);
    await tester.tapAt(Offset(cell.center.dx, cell.top + 5));
    await _pump(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.apps);
    await tester.longPress(find.text('Tasks'));
    await _pump(tester);
    final semantics = tester.ensureSemantics();
    expect(
      tester
          .getSemantics(find.byTooltip('Hide app').first)
          .getSemanticsData()
          .flagsCollection
          .isButton,
      isTrue,
    );
    await tester.tapAt(cell.topLeft + const Offset(2, 70));
    await _pump(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.apps);
    expect(find.byTooltip('Hide app'), findsNothing);
    semantics.dispose();
  });
}
