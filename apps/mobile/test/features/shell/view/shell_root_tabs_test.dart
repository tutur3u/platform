import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_root_tabs_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/custom_navigation_bar.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_navigation_rail.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/shell/view/shell_root_more_sheet.dart';
import 'package:mobile/features/shell/view/shell_root_tabs_editor.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

const String _storageKey = SharedPreferencesShellRootTabsStore.storageKey;

const _mailUser = supa.User(
  id: 'user',
  appMetadata: {},
  userMetadata: {},
  aud: 'authenticated',
  email: 'dock-fixture@tuturuuu.com',
  createdAt: '2026-01-01T00:00:00Z',
);

/// Pumps the real shell at [location]. Mail is openable only with
/// [mailAvailable]: the experiment on and an eligible account.
Future<GoRouter> _pumpShell(
  WidgetTester tester, {
  String location = Routes.home,
  bool mailAvailable = false,
  Size size = const Size(390, 844),
  List<String>? savedTabs,
}) async {
  SharedPreferences.setMockInitialValues({
    if (mailAvailable) 'enabled-experimental-apps': ['mail'],
    _storageKey: ?savedTabs,
  });
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
    initialState: mailAvailable
        ? const AuthState.authenticated(_mailUser)
        : const AuthState.unauthenticated(),
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

MorphingNavigationBar _dock(WidgetTester tester) =>
    tester.widget<MorphingNavigationBar>(find.byType(MorphingNavigationBar));

List<Key?> _dockKeys(WidgetTester tester) =>
    _dock(tester).children.map((item) => item.key).toList();

List<Key?> _keys(List<ShellRootTab> tabs) => [
  for (final tab in tabs) tab.key,
  shellRootMoreKey,
];

String _path(GoRouter router) => router.routeInformationProvider.value.uri.path;

Finder _overflowRow(Key key) => find.byKey(shellRootMoreRowKey(key));

Finder _moreRow(ShellRootTab tab) => _overflowRow(tab.key);

Future<void> _openMore(WidgetTester tester) async {
  await tester.tap(find.byKey(shellRootMoreKey));
  await _settle(tester);
}

Future<void> _closeSheet(WidgetTester tester) async {
  Navigator.of(tester.element(find.byType(AppSheetScaffold))).pop();
  await _settle(tester);
}

void main() {
  test('tabs read during startup seed the first state', () async {
    SharedPreferences.setMockInitialValues({
      SharedPreferencesShellRootTabsStore.storageKey: ['calendar', 'home'],
    });
    addTearDown(ShellRootTabsCubit.resetWarmForTesting);
    await ShellRootTabsCubit.warm();
    final cubit = ShellRootTabsCubit();
    addTearDown(cubit.close);
    // No async load needed: the first frame already has the saved tabs.
    expect(cubit.state, [ShellRootTab.calendar, ShellRootTab.home]);
  });

  group('resolveShellRootTabs', () {
    test('defaults are Home, Apps, Mira and Alerts', () {
      expect(resolveShellRootTabs(null, isAvailable: (_) => true), [
        ShellRootTab.home,
        ShellRootTab.apps,
        ShellRootTab.assistant,
        ShellRootTab.notifications,
      ]);
    });

    test('fills an unavailable default with Tasks, then Calendar', () {
      expect(
        resolveShellRootTabs(
          null,
          isAvailable: (tab) => tab != ShellRootTab.apps,
        ),
        [
          ShellRootTab.home,
          ShellRootTab.assistant,
          ShellRootTab.notifications,
          ShellRootTab.tasks,
        ],
      );
      expect(
        resolveShellRootTabs(
          null,
          isAvailable: (tab) =>
              tab != ShellRootTab.apps && tab != ShellRootTab.tasks,
        ).last,
        ShellRootTab.calendar,
      );
    });

    test(
      'refills an unavailable custom tab and keeps a short choice short',
      () {
        bool noMail(ShellRootTab tab) => tab != ShellRootTab.mail;
        expect(
          resolveShellRootTabs([
            ShellRootTab.tasks,
            ShellRootTab.mail,
            ShellRootTab.apps,
            ShellRootTab.profile,
          ], isAvailable: noMail),
          [
            ShellRootTab.tasks,
            ShellRootTab.apps,
            ShellRootTab.profile,
            ShellRootTab.home,
          ],
        );
        expect(
          resolveShellRootTabs([
            ShellRootTab.mail,
            ShellRootTab.apps,
          ], isAvailable: noMail),
          [ShellRootTab.apps, ShellRootTab.home],
        );
        expect(
          resolveShellRootTabs([ShellRootTab.calendar], isAvailable: noMail),
          [ShellRootTab.calendar],
        );
      },
    );
  });

  testWidgets('fresh prefs pin Home, Apps, Mira and Alerts', (tester) async {
    await _pumpShell(tester, mailAvailable: true);
    expect(_dockKeys(tester), _keys(shellDefaultRootTabs));
    expect(_dock(tester).selectedKey, ShellRootTab.home.key);
    for (final label in ['Home', 'Apps', 'Mira', 'Alerts', 'More']) {
      final slot = find.descendant(
        of: find.byType(MorphingNavigationBar),
        matching: find.bySemanticsLabel(label),
      );
      expect(slot, findsOneWidget, reason: label);
      expect(
        tester.getSemantics(slot).rect.width,
        greaterThanOrEqualTo(44),
        reason: label,
      );
    }
  });

  testWidgets('a saved custom set is kept', (tester) async {
    await _pumpShell(
      tester,
      mailAvailable: true,
      savedTabs: ['home', 'tasks', 'calendar', 'mail'],
    );
    expect(
      _dockKeys(tester),
      _keys([
        ShellRootTab.home,
        ShellRootTab.tasks,
        ShellRootTab.calendar,
        ShellRootTab.mail,
      ]),
    );
  });

  testWidgets('More lists the workspace, the rest, then the tab actions', (
    tester,
  ) async {
    final router = await _pumpShell(tester, mailAvailable: true);
    await _openMore(tester);
    final order = [
      shellRootWorkspaceKey,
      ShellRootTab.tasks.key,
      ShellRootTab.calendar.key,
      ShellRootTab.mail.key,
      ShellRootTab.profile.key,
      shellRootSettingsKey,
      shellRootEditTabsKey,
      shellRootResetTabsKey,
    ];
    double? previous;
    for (final key in order) {
      final row = _overflowRow(key);
      await tester.ensureVisible(row);
      final top = tester.getTopLeft(row).dy;
      // Rows sit in one scroll view: compare against the first row's offset.
      final offset = tester.getTopLeft(_overflowRow(shellRootWorkspaceKey)).dy;
      final position = top - offset;
      if (previous != null) {
        expect(position, greaterThan(previous), reason: '$key');
      }
      previous = position;
    }
    for (final tab in shellDefaultRootTabs) {
      expect(_moreRow(tab), findsNothing, reason: tab.name);
    }
    await tester.ensureVisible(_moreRow(ShellRootTab.profile));
    await tester.tap(_moreRow(ShellRootTab.profile));
    await _settle(tester);
    expect(_path(router), Routes.profileRoot);
    expect(_dock(tester).selectedKey, shellRootMoreKey);
  });

  testWidgets('the workspace row opens the workspace picker', (tester) async {
    await _pumpShell(tester);
    await _openMore(tester);
    expect(find.text('Studio'), findsOneWidget);
    await tester.tap(_overflowRow(shellRootWorkspaceKey));
    await _settle(tester);
    expect(find.text('Workspaces'), findsOneWidget);
  });

  testWidgets('More opens Settings', (tester) async {
    final router = await _pumpShell(tester);
    await _openMore(tester);
    await tester.ensureVisible(_overflowRow(shellRootSettingsKey));
    await tester.tap(_overflowRow(shellRootSettingsKey));
    await _settle(tester);
    expect(_path(router), Routes.settings);
  });

  testWidgets('the Home header has no workspace switcher', (tester) async {
    await _pumpShell(tester);
    expect(find.byKey(const ValueKey('shell-workspace-avatar')), findsNothing);
    expect(find.text('Studio'), findsNothing);
    expect(find.bySemanticsLabel(RegExp('Workspaces')), findsNothing);
  });

  testWidgets('More is selected on a root destination without a tab', (
    tester,
  ) async {
    await _pumpShell(tester, location: Routes.profileRoot);
    expect(_dock(tester).selectedKey, shellRootMoreKey);
    expect(_dockKeys(tester).first, ShellRootTab.home.key);
  });

  testWidgets('Edit tabs saves the chosen order and Reset restores defaults', (
    tester,
  ) async {
    await _pumpShell(tester, mailAvailable: true);
    await _openMore(tester);
    await tester.ensureVisible(_overflowRow(shellRootEditTabsKey));
    await tester.tap(_overflowRow(shellRootEditTabsKey));
    await _settle(tester);
    await tester.tap(find.byKey(shellRootTabOptionKey(ShellRootTab.apps)));
    await _settle(tester);
    await tester.tap(find.byKey(shellRootTabOptionKey(ShellRootTab.tasks)));
    await _settle(tester);
    // Four tabs are pinned, so another candidate cannot be added.
    await tester.tap(find.byKey(shellRootTabOptionKey(ShellRootTab.profile)));
    await _settle(tester);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getStringList(_storageKey), [
      'home',
      'assistant',
      'notifications',
      'tasks',
    ]);
    await _closeSheet(tester);
    expect(
      _dockKeys(tester),
      _keys([
        ShellRootTab.home,
        ShellRootTab.assistant,
        ShellRootTab.notifications,
        ShellRootTab.tasks,
      ]),
    );

    await _openMore(tester);
    expect(_moreRow(ShellRootTab.apps), findsOneWidget);
    await tester.ensureVisible(_overflowRow(shellRootEditTabsKey));
    await tester.tap(_overflowRow(shellRootEditTabsKey));
    await _settle(tester);
    await tester.tap(find.byKey(shellRootTabsResetKey));
    await _settle(tester);
    expect(prefs.getStringList(_storageKey), isNull);
    await _closeSheet(tester);
    expect(_dockKeys(tester), _keys(shellDefaultRootTabs));
  });

  testWidgets('Reset tabs in More restores the default tabs', (tester) async {
    await _pumpShell(tester, savedTabs: ['tasks', 'calendar']);
    expect(
      _dockKeys(tester),
      _keys([ShellRootTab.tasks, ShellRootTab.calendar]),
    );
    await _openMore(tester);
    await tester.ensureVisible(_overflowRow(shellRootResetTabsKey));
    await tester.tap(_overflowRow(shellRootResetTabsKey));
    await _settle(tester);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getStringList(_storageKey), isNull);
    expect(_dockKeys(tester), _keys(shellDefaultRootTabs));
  });

  testWidgets('saved tabs skip unknown ids and refill unavailable ones', (
    tester,
  ) async {
    await _pumpShell(
      tester,
      savedTabs: ['bogus', 'mail', 'notifications', 'home', 'home'],
    );
    // Mail is unavailable: its slot takes the first unused default.
    expect(
      _dockKeys(tester),
      _keys([ShellRootTab.notifications, ShellRootTab.home, ShellRootTab.apps]),
    );
  });

  testWidgets('Back from Tasks opened by its tab returns to Home', (
    tester,
  ) async {
    final router = await _pumpShell(tester, savedTabs: ['home', 'tasks']);
    await tester.tap(find.byKey(ShellRootTab.tasks.key));
    await _settle(tester);
    expect(_path(router), Routes.tasks);
    await tester.tap(find.bySemanticsLabel('Back'));
    await _settle(tester);
    expect(_path(router), Routes.home);

    await tester.tap(find.byKey(ShellRootTab.tasks.key));
    await _settle(tester);
    await tester.binding.handlePopRoute();
    await _settle(tester);
    expect(_path(router), Routes.home);
  });

  testWidgets('the tablet rail keeps its fixed destinations', (tester) async {
    await _pumpShell(
      tester,
      mailAvailable: true,
      size: const Size(1280, 800),
      savedTabs: ['tasks'],
    );
    final rail = tester.widget<ShellNavigationRail>(
      find.byType(ShellNavigationRail),
    );
    expect(rail.items.map((item) => item.key), [
      ShellRootTab.home.key,
      ShellRootTab.apps.key,
      ShellRootTab.assistant.key,
      ShellRootTab.notifications.key,
      ShellRootTab.profile.key,
    ]);
  });
}
