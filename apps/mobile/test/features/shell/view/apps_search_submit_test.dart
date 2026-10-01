import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
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
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

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
  var calendarEntries = 0;

  setUp(() async {
    calendarEntries = 0;
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
            GoRoute(
              path: Routes.calendar,
              builder: (_, _) {
                calendarEntries += 1;
                return const SizedBox();
              },
            ),
            GoRoute(path: Routes.chat, builder: (_, _) => const SizedBox()),
            GoRoute(
              path: Routes.taskPlanning,
              builder: (_, _) => const ShellMiniNav(
                ownerId: 'task-planning-mini-nav',
                locations: {Routes.taskPlanning},
                deepLinkBackRoute: Routes.tasks,
                items: [],
              ),
            ),
            GoRoute(
              path: Routes.taskBoards,
              builder: (_, _) => const SizedBox(),
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

  final searchField = find.byKey(const ValueKey('shell-search-query'));
  Future<void> search(WidgetTester tester, String query) async {
    await tester.tap(find.byIcon(Icons.search_rounded).first);
    await _pump(tester);
    expect(searchField, findsOneWidget);
    await tester.enterText(searchField, query);
    await _pump(tester);
  }

  Future<void> submit(WidgetTester tester) async {
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await _pump(tester);
  }

  testWidgets(
    'unique normalized current result launches once and clears search',
    (tester) async {
      await mount(tester);
      await search(tester, '  CaLeNdAr  ');
      final field = tester.widget<TextField>(searchField);
      field.onSubmitted!('  CaLeNdAr  ');
      field.onSubmitted!('  CaLeNdAr  ');
      await _pump(tester);
      expect(router.routeInformationProvider.value.uri.path, Routes.calendar);
      expect(apps.state.selectedId, 'calendar');
      expect(calendarEntries, 1);
      expect(field.controller!.text, isEmpty);
      await tester.binding.handlePopRoute();
      await _pump(tester);
      expect(router.routeInformationProvider.value.uri.path, Routes.apps);
      expect(searchField, findsNothing);
      await search(tester, '');
      expect(tester.widget<TextField>(searchField).controller!.text, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('real IME launch from Home through Apps preserves Apps origin', (
    tester,
  ) async {
    await mount(tester);
    router.go(Routes.home);
    await _pump(tester);
    router.go(Routes.apps);
    await _pump(tester);
    await tester.tap(find.byIcon(Icons.view_agenda_rounded).first);
    await _pump(tester);
    await search(tester, 'calendar');
    await submit(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.calendar);
    expect(apps.state.selectedId, 'calendar');
    expect(calendarEntries, 1);
    await tester.binding.handlePopRoute();
    await _pump(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.apps);
    expect(apps.state.appOrigin, Routes.apps);
    router.go(Routes.apps);
    await _pump(tester);
    expect(searchField, findsNothing);
    expect(tester.takeException(), isNull);
  });
  for (final query in ['no-such-module', 'a', '   ']) {
    testWidgets(
      'IME preserves search for zero multiple or empty results: $query',
      (tester) async {
        await mount(tester);
        await search(tester, query);
        await submit(tester);
        expect(router.routeInformationProvider.value.uri.path, Routes.apps);
        expect(searchField, findsOneWidget);
        expect(tester.widget<TextField>(searchField).controller!.text, query);
        expect(apps.state.selectedId, isNull);
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets('stale submission cannot launch a different current query', (
    tester,
  ) async {
    await mount(tester);
    await search(tester, 'calendar');
    final oldSubmit = tester.widget<TextField>(searchField).onSubmitted!;
    await tester.enterText(searchField, 'no-such-module');
    oldSubmit('calendar');
    await _pump(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.apps);
    expect(
      tester.widget<TextField>(searchField).controller!.text,
      'no-such-module',
    );
    expect(apps.state.selectedId, isNull);
  });
  testWidgets(
    'availability change before frame rejects formerly unique result',
    (tester) async {
      await experiments.setModuleEnabled(moduleId: 'chat', enabled: true);
      await mount(tester);
      await search(tester, 'chat');
      final submit = tester.widget<TextField>(searchField).onSubmitted!;
      submit('chat');
      await experiments.setModuleEnabled(moduleId: 'chat', enabled: false);
      await _pump(tester);
      expect(router.routeInformationProvider.value.uri.path, Routes.apps);
      expect(tester.widget<TextField>(searchField).controller!.text, 'chat');
      expect(apps.state.selectedId, isNull);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('IME exits reorder and returning does not restore it', (
    tester,
  ) async {
    await mount(tester);
    await tester.longPress(find.text('Tasks'));
    await _pump(tester);
    expect(find.byTooltip('Hide app'), findsWidgets);
    await search(tester, 'calendar');
    expect(find.byTooltip('Hide app'), findsNothing);
    await submit(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.calendar);
    router.go(Routes.apps);
    await _pump(tester);
    expect(find.byTooltip('Hide app'), findsNothing);
    expect(searchField, findsNothing);
    expect(tester.takeException(), isNull);
  });
}
