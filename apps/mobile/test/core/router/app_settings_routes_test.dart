import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/app_router.dart';
import 'package:mobile/core/router/app_settings_routes.dart';
import 'package:mobile/core/router/deep_links.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/cubit/app_tab_state.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/education/cubit/education_access_cubit.dart';
import 'package:mobile/features/habits/cubit/habits_access_cubit.dart';
import 'package:mobile/features/inventory/cubit/inventory_access_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Habits extends MockCubit<HabitsAccessState>
    implements HabitsAccessCubit {}

class _Education extends MockCubit<EducationAccessState>
    implements EducationAccessCubit {}

class _Inventory extends MockCubit<InventoryAccessState>
    implements InventoryAccessCubit {}

class _Tabs extends MockCubit<AppTabState> implements AppTabCubit {}

/// The shipped routes with their pages stubbed; redirects stay real.
List<RouteBase> _stubbed(List<RouteBase> routes) => [
  for (final route in routes.cast<GoRoute>())
    GoRoute(
      path: route.path,
      redirect: route.redirect,
      builder: (_, _) => const SizedBox(),
    ),
];

GoRouter _router(String initial) => GoRouter(
  initialLocation: initial,
  routes: [
    // Mirrors app_router: aliases precede the parameterised detail routes.
    ..._stubbed(appSettingsAliasRoutes()),
    GoRoute(path: Routes.settings, builder: (_, _) => const SizedBox()),
    ..._stubbed(appSettingsRoutes()),
    GoRoute(path: Routes.taskDetail, builder: (_, _) => const SizedBox()),
    GoRoute(
      path: Routes.calendarEventDetail,
      builder: (_, _) => const SizedBox(),
    ),
    GoRoute(path: Routes.finance, builder: (_, _) => const SizedBox()),
    GoRoute(path: Routes.timer, builder: (_, _) => const SizedBox()),
  ],
);

void main() {
  test('only routed apps resolve a central settings location', () {
    expect(Routes.centralAppSettingsIds, {
      'tasks',
      'calendar',
      'finance',
      'timer',
      'assistant',
    });
    expect(Routes.appSettingsLocation('timer'), '/settings/apps/timer');
    expect(Routes.appSettingsLocation('assistant'), '/settings/apps/assistant');
    expect(Routes.appSettingsLocation('mail'), isNull);
    expect(Routes.appSettingsLocation(null), isNull);
  });

  test('registered detail routes keep the shipped redirect contract', () {
    final paths = appSettingsRoutes().whereType<GoRoute>().map((r) => r.path);
    expect(paths, [Routes.settingsApps, Routes.settingsAppDetail]);
  });

  for (final entry in {
    '/tasks/settings': '/settings/apps/tasks',
    '/calendar/settings': '/settings/apps/calendar',
    '/finance/settings': '/settings/apps/finance',
    '/timer/settings': '/settings/apps/timer',
    '/settings/apps': Routes.settings,
    '/settings/apps/mail': Routes.settings,
    '/settings/apps/unknown': Routes.settings,
    '/settings/apps/finance': '/settings/apps/finance',
  }.entries) {
    testWidgets('${entry.key} opens ${entry.value}', (tester) async {
      final router = _router(entry.key);
      addTearDown(router.dispose);
      await tester.pumpWidget(
        WidgetsApp.router(color: const Color(0xFF000000), routerConfig: router),
      );
      await tester.pump();
      expect(router.state.matchedLocation, entry.value);
      expect(tester.takeException(), isNull);
    });
  }

  test('web and app links open the central app settings', () {
    for (final entry in {
      'https://tuturuuu.com/en/personal/settings/apps/timer':
          '/settings/apps/timer',
      'https://tuturuuu.com/personal/settings/apps/mail': Routes.settings,
      'https://tuturuuu.com/personal/finance/settings':
          '/settings/apps/finance',
      'https://tuturuuu.com/personal/calendar/settings':
          '/settings/apps/calendar',
      'https://tuturuuu.com/personal/tasks/settings': '/settings/apps/tasks',
      'https://tasks.tuturuuu.com/personal/settings': '/settings/apps/tasks',
      // Unrelated module paths keep their previous destinations.
      'https://tuturuuu.com/personal/calendar': Routes.calendar,
      'https://tuturuuu.com/personal/settings/offline/tasks':
          Routes.settingsOfflineModulePath('tasks'),
    }.entries) {
      expect(
        resolveMobileDeepLink(Uri.parse(entry.key))?.location,
        entry.value,
        reason: entry.key,
      );
    }
  });

  test('the real app router resolves app settings before detail routes', () {
    final auth = _Auth();
    final workspaces = _Workspaces();
    final habits = _Habits();
    final education = _Education();
    final inventory = _Inventory();
    final tabs = _Tabs();
    whenListen(auth, const Stream<AuthState>.empty());
    whenListen(workspaces, const Stream<WorkspaceState>.empty());
    whenListen(habits, const Stream<HabitsAccessState>.empty());
    whenListen(education, const Stream<EducationAccessState>.empty());
    whenListen(inventory, const Stream<InventoryAccessState>.empty());
    final router = createAppRouter(
      auth,
      workspaces,
      habits,
      education,
      inventory,
      tabs,
    );
    addTearDown(router.dispose);
    String leaf(String location) =>
        router.configuration.findMatch(Uri.parse(location)).last.route.path;
    // `/calendar/:eventId` comes from the app registry; the aliases win.
    expect(leaf('/calendar/settings'), '/calendar/settings');
    expect(leaf('/calendar/evt-1'), Routes.calendarEventDetail);
    for (final root in ['/tasks', '/finance', '/timer']) {
      expect(leaf('$root/settings'), '$root/settings');
    }
    expect(leaf('/settings/apps/timer'), Routes.settingsAppDetail);
    expect(leaf('/settings/apps'), Routes.settingsApps);
  });
}
