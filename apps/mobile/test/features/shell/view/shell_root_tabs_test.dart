import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
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
import 'package:mobile/features/shell/view/custom_navigation_bar.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/shell/view/shell_workspace_picker.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

const _storageKey = 'shell-dock-root-tabs-v1';

Future<GoRouter> _pumpShell(
  WidgetTester tester, {
  String location = Routes.home,
  Size size = const Size(390, 844),
  List<String>? savedTabs,
}) async {
  SharedPreferences.setMockInitialValues({_storageKey: ?savedTabs});
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(tester.view.reset);
  final settings = SettingsRepository();
  final tabs = AppTabCubit(settingsRepository: settings);
  final experiments = ExperimentalAppsCubit(settingsRepository: settings);
  await experiments.load();
  final auth = _Auth();
  final workspace = _Workspace();
  final profile = _Profile();
  whenListen(
    auth,
    const Stream<AuthState>.empty(),
    initialState: const AuthState.unauthenticated(),
  );
  when(workspace.refreshHiddenWorkspaces).thenAnswer((_) async {});
  when(() => workspace.hasAuthenticatedActor).thenReturn(false);
  whenListen(
    workspace,
    const Stream<WorkspaceState>.empty(),
    initialState: const WorkspaceState(
      status: WorkspaceStatus.loaded,
      workspaces: [Workspace(id: 'ws', name: 'Studio')],
      currentWorkspace: Workspace(id: 'ws', name: 'Studio'),
    ),
  );
  whenListen(
    profile,
    const Stream<ShellProfileState>.empty(),
    initialState: const ShellProfileState(),
  );
  final router = GoRouter(
    initialLocation: location,
    routes: [
      ShellRoute(
        builder: (context, state, child) => ShellPage(
          matchedLocation: state.uri.path,
          enableDebugLogs: false,
          assistantPageBuilder: (_) => const Text('assistant'),
          homePageBuilder: (_) => const Text('home'),
          notificationsPageBuilder: (_) => const Text('notifications'),
          profilePageBuilder: (_) => const Text('profile'),
          child: child,
        ),
        routes: [
          for (final route in [
            Routes.home,
            Routes.apps,
            Routes.assistant,
            Routes.notifications,
            Routes.notificationsArchive,
            Routes.profileRoot,
            Routes.tasks,
            Routes.calendar,
            Routes.mail,
            Routes.finance,
            Routes.settings,
          ])
            GoRoute(path: route, builder: (_, _) => Text(route)),
        ],
      ),
    ],
  );
  addTearDown(() async {
    await tester.pumpWidget(const SizedBox.shrink());
    router.dispose();
    await tabs.close();
    await experiments.close();
    await auth.close();
    await workspace.close();
    await profile.close();
  });
  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider.value(value: tabs),
        BlocProvider.value(value: experiments),
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<WorkspaceCubit>.value(value: workspace),
        BlocProvider<ShellProfileCubit>.value(value: profile),
        BlocProvider(create: (_) => AssistantChromeCubit()),
        BlocProvider(create: (_) => ShellChromeActionsCubit()),
        BlocProvider(create: (_) => ShellMiniNavCubit()),
        BlocProvider(create: (_) => ShellTitleOverrideCubit()),
      ],
      child: shellTestApp(router: router),
    ),
  );
  await _settle(tester);
  return router;
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 14; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  testWidgets('the fixed root dock ignores a legacy saved tab selection', (
    tester,
  ) async {
    final router = await _pumpShell(tester, savedTabs: ['tasks', 'calendar']);
    final dock = find.byType(MorphingNavigationBar);
    final expected = ['Home', 'Apps', 'Mira', 'Alerts', 'Profile'];
    final slots = tester.widget<MorphingNavigationBar>(dock).children;
    expect(
      slots.map((item) => item.key),
      ShellRootTab.values.map((tab) => tab.key),
    );
    for (final label in expected) {
      expect(
        find.descendant(of: dock, matching: find.bySemanticsLabel(label)),
        findsOneWidget,
      );
      expect(
        find.descendant(of: dock, matching: find.text(label)),
        findsNothing,
      );
    }
    expect(
      find.descendant(of: dock, matching: find.bySemanticsLabel('More')),
      findsNothing,
    );

    await tester.tap(find.byKey(ShellRootTab.profile.key));
    await _settle(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.profileRoot);
  });

  testWidgets('active workspace opens from Home and Profile headers only', (
    tester,
  ) async {
    final router = await _pumpShell(tester);
    final picker = find.byType(ShellWorkspacePicker);
    for (final tab in ShellRootTab.values) {
      router.go(tab.route);
      await _settle(tester);
      final showsPicker =
          tab == ShellRootTab.home || tab == ShellRootTab.profile;
      expect(
        picker,
        showsPicker ? findsOneWidget : findsNothing,
        reason: tab.name,
      );
      if (showsPicker) {
        expect(tester.getSize(picker), const Size.square(44));
        expect(tester.getTopLeft(picker).dy, lessThan(56));
        await tester.tap(picker);
        await _settle(tester);
        expect(find.byType(AppSheetScaffold), findsOneWidget);
        expect(find.text('Studio'), findsOneWidget);
        Navigator.of(tester.element(find.byType(AppSheetScaffold))).pop();
        await _settle(tester);
      }
    }
    for (final route in [Routes.settings, Routes.tasks, Routes.finance]) {
      router.go(route);
      await _settle(tester);
      expect(picker, findsNothing, reason: route);
    }
  });

  for (final size in [const Size(390, 844), const Size(834, 1194)]) {
    testWidgets(
      'Back stays inside the dock at the same position at ${size.width}dp',
      (tester) async {
        final router = await _pumpShell(tester, size: size);
        final material = find.byKey(
          const ValueKey('persistent-shell-dock-material'),
        );
        final back = find.byKey(const ValueKey('shell-dock-back'));
        final root = tester.getRect(material);
        expect(root.width, ShellDockMetrics.widthFor(size.width));
        expect(back, findsNothing);

        Rect? firstBack;
        for (final route in [
          Routes.notificationsArchive,
          Routes.finance,
          Routes.tasks,
          Routes.calendar,
          Routes.settings,
        ]) {
          router.go(route);
          await _settle(tester);
          expect(find.descendant(of: material, matching: back), findsOneWidget);
          expect(tester.getRect(material), root);
          final rect = tester.getRect(back);
          expect(rect.size, const Size.square(ShellDockMetrics.slot));
          expect(rect.left, root.left + ShellDockMetrics.padding);
          expect(rect.center.dy, root.center.dy);
          firstBack ??= rect;
          expect(rect, firstBack, reason: route);
        }

        var saves = 0;
        tester
            .element(find.byType(ShellPage))
            .read<ShellChromeActionsCubit>()
            .register(
              registrationId: 'fixture-save',
              ownerId: 'fixture-save',
              locations: const {Routes.settings},
              actions: [
                ShellActionSpec(
                  id: 'fixture-save',
                  icon: Icons.save,
                  tooltip: 'Save fixture',
                  inDock: true,
                  onPressed: () => saves++,
                ),
              ],
            );
        await _settle(tester);
        expect(tester.getRect(back), firstBack);
        await tester.tap(find.byTooltip('Save fixture'));
        expect(saves, 1);
      },
    );
  }
}
