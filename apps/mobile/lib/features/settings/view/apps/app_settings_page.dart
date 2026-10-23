import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/settings/view/apps/app_settings_sections.dart';
import 'package:mobile/features/settings/view/apps/timer_app_settings.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Central settings for one app, shown at `/settings/apps/:appId`. In-app
/// gear actions deep-link here so every setting has a single editor.
class AppSettingsPage extends StatelessWidget {
  const AppSettingsPage({
    required this.appId,
    this.settingsRepository,
    this.timeTrackerRepository,
    this.permissionsRepository,
    this.cacheStore,
    super.key,
  });

  final String appId;
  final SettingsRepository? settingsRepository;
  final ITimeTrackerRepository? timeTrackerRepository;
  final WorkspacePermissionsRepository? permissionsRepository;
  final CacheStore? cacheStore;

  /// Apps with locally prepared offline data link to their offline screen.
  static const _offlineModules = {'tasks', 'calendar', 'finance'};

  @override
  Widget build(BuildContext context) {
    final horizontal = ResponsivePadding.horizontal(context.deviceClass);
    final groups = switch (appId) {
      'tasks' => [TasksAppSettings(settingsRepository: settingsRepository)],
      'calendar' => const [CalendarAppSettings()],
      'finance' => const [FinanceAppSettings()],
      'timer' => [
        TimerAppSettings(
          repository: timeTrackerRepository,
          permissionsRepository: permissionsRepository,
          cacheStore: cacheStore,
        ),
      ],
      _ => const <Widget>[],
    };
    return shad.Scaffold(
      child: ResponsiveWrapper(
        maxWidth: ResponsivePadding.rootContentWidth(context.deviceClass),
        child: ListView(
          key: ValueKey('app-settings-$appId'),
          physics: const AlwaysScrollableScrollPhysics(
            parent: BouncingScrollPhysics(),
          ),
          padding: SettingsRowLayout.scrollPadding(context, horizontal),
          children: [
            ...groups,
            if (_offlineModules.contains(appId)) ...[
              const SizedBox(height: SettingsRowLayout.groupGap),
              SettingsCompactSection(
                title: context.l10n.offlineSectionTitle,
                children: [
                  SettingsTile(
                    key: ValueKey('app-settings-$appId-offline'),
                    grouped: true,
                    icon: shad.LucideIcons.hardDriveDownload,
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
      ),
    );
  }
}
