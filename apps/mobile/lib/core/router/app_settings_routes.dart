import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/settings/view/apps/app_settings_page.dart';

/// Mini-app roots whose `<root>/settings` path redirects to the central
/// sub-screen. These must precede `/tasks/:taskId` and `/calendar/:eventId`.
const Map<String, String> _appSettingsAliasRoots = {
  'tasks': Routes.tasks,
  'calendar': Routes.calendar,
  'finance': Routes.finance,
  'timer': Routes.timer,
};

List<RouteBase> appSettingsAliasRoutes() => [
  for (final entry in _appSettingsAliasRoots.entries)
    GoRoute(
      path: '${entry.value}/settings',
      redirect: (_, _) => Routes.settingsAppPath(entry.key),
    ),
];

List<RouteBase> appSettingsRoutes() => [
  GoRoute(path: Routes.settingsApps, redirect: (_, _) => Routes.settings),
  GoRoute(
    path: Routes.settingsAppDetail,
    redirect: (_, state) =>
        Routes.appSettingsLocation(state.pathParameters['appId']) == null
        ? Routes.settings
        : null,
    builder: (_, state) =>
        AppSettingsPage(appId: state.pathParameters['appId']!),
  ),
];
