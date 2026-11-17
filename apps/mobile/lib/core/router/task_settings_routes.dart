import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/task_settings/view/task_settings_page.dart';
import 'package:mobile/features/task_settings/view/task_settings_section_page.dart';

/// Task settings and its lists. The Planning, Estimates and Portfolio paths
/// redirect here so existing links keep opening the same content.
List<RouteBase> taskSettingsRoutes() => [
  GoRoute(
    path: Routes.taskSettings,
    builder: (_, _) => const TaskSettingsPage(),
  ),
  GoRoute(
    path: Routes.taskSettingsProjects,
    builder: (_, _) =>
        const TaskSettingsSectionPage(section: TaskSettingsSection.projects),
  ),
  GoRoute(
    path: Routes.taskSettingsInitiatives,
    builder: (_, _) =>
        const TaskSettingsSectionPage(section: TaskSettingsSection.initiatives),
  ),
  GoRoute(
    path: Routes.taskSettingsLabels,
    builder: (_, _) =>
        const TaskSettingsSectionPage(section: TaskSettingsSection.labels),
  ),
  GoRoute(path: Routes.taskPlanning, redirect: (_, _) => Routes.taskSettings),
  GoRoute(path: Routes.taskEstimates, redirect: (_, _) => Routes.taskSettings),
  GoRoute(
    path: Routes.taskPortfolio,
    redirect: (_, _) => Routes.taskSettingsProjects,
  ),
];
