import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';

/// Offline module pages link to the app's single settings sub-screen rather
/// than repeating its editors.
class OfflineModulePreferences extends StatelessWidget {
  const OfflineModulePreferences({
    required this.moduleId,
    required this.userId,
    required this.workspaceId,
    super.key,
  });
  final String moduleId;
  final String userId;
  final String workspaceId;

  @override
  Widget build(BuildContext context) {
    final location = Routes.appSettingsLocation(moduleId);
    if (location == null) return const SizedBox.shrink();
    final l10n = context.l10n;
    return Padding(
      padding: const EdgeInsets.only(top: 20),
      child: SettingsCompactSection(
        title: l10n.settingsAppPreferences,
        children: [
          SettingsTile(
            key: ValueKey('offline-$moduleId-app-settings'),
            grouped: true,
            icon: LucideIcons.slidersHorizontal,
            title: l10n.settingsAppSettingsFor(_moduleLabel(l10n)),
            onTap: () => context.push(location),
          ),
        ],
      ),
    );
  }

  String _moduleLabel(AppLocalizations l10n) => switch (moduleId) {
    'tasks' => l10n.navTasks,
    'calendar' => l10n.navCalendar,
    'finance' => l10n.navFinance,
    _ => moduleId,
  };
}
