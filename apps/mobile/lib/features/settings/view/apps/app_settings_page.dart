import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/settings/view/apps/app_settings_group.dart';
import 'package:mobile/features/settings/view/apps/app_settings_sections.dart';
import 'package:mobile/features/settings/view/apps/timer_app_settings.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';

/// Central settings for one app, shown at `/settings/apps/:appId`. In-app
/// gear actions deep-link here so every setting has a single editor.
class AppSettingsPage extends StatelessWidget {
  const AppSettingsPage({
    required this.appId,
    this.settingsRepository,
    this.timeTrackerRepository,
    this.permissionsRepository,
    this.cacheStore,
    this.focus,
    super.key,
  });

  final String appId;
  final SettingsRepository? settingsRepository;
  final ITimeTrackerRepository? timeTrackerRepository;
  final WorkspacePermissionsRepository? permissionsRepository;
  final CacheStore? cacheStore;

  /// Optional row to open on arrival, such as `threshold` from Requests.
  final String? focus;

  /// Apps with locally prepared offline data link to their offline screen.
  static const _offlineModules = {'tasks', 'calendar', 'finance'};

  @override
  Widget build(BuildContext context) {
    final groups = switch (appId) {
      'tasks' => [TasksAppSettings(settingsRepository: settingsRepository)],
      'calendar' => const [CalendarAppSettings()],
      'finance' => const [FinanceAppSettings()],
      'timer' => [
        TimerAppSettings(
          repository: timeTrackerRepository,
          permissionsRepository: permissionsRepository,
          cacheStore: cacheStore,
          focusThreshold: focus == 'threshold',
        ),
      ],
      _ => const <Widget>[],
    };
    return AppScaffold(
      child: AppPageListView(
        key: ValueKey('app-settings-$appId'),
        kind: AppPageKind.root,
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        children: [
          ...groups,
          if (_offlineModules.contains(appId)) ...[
            const SizedBox(height: AppLayout.sectionGap),
            AppSettingsGroup(
              title: context.l10n.offlineSectionTitle,
              footer: context.l10n.settingsFooterOffline,
              children: [
                SettingsTile(
                  key: ValueKey('app-settings-$appId-offline'),
                  grouped: true,
                  icon: LucideIcons.hardDriveDownload,
                  title: context.l10n.settingsAppOfflineData,
                  value: context.l10n.settingsAppOfflineDataDescription,
                  onTap: () =>
                      context.push(Routes.settingsOfflineModulePath(appId)),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
