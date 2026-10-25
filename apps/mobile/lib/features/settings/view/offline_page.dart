import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/settings/view/cache_storage_sheet.dart';
import 'package:mobile/features/settings/view/offline_changes_sheet.dart';
import 'package:mobile/features/settings/view/offline_preparation_section.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// Shell owners can embed this body without creating competing app chrome.
class OfflinePage extends StatelessWidget {
  const OfflinePage({this.embedded = false, this.coordinator, super.key});
  final OfflinePreparationCoordinator? coordinator;
  final bool embedded;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final body = AppPageListView(
      children: [
        OfflinePreparationSection(
          coordinator: coordinator,
          showModuleDetails: true,
        ),
        const SizedBox(height: 24),
        SettingsCompactSection(
          title: l10n.offlinePreferencesTitle,
          children: [
            SettingsTile(
              grouped: true,
              wrapSupportingText: true,
              icon: LucideIcons.hardDrive,
              title: l10n.cacheStorageTitle,
              subtitle: l10n.offlineStorageScope,
              onTap: () => unawaited(showCacheStorageSheet(context)),
            ),
            SettingsTile(
              grouped: true,
              icon: LucideIcons.refreshCw,
              title: l10n.offlineChangesTitle,
              onTap: () => unawaited(
                showOfflineChangesSheet(
                  context,
                  userId: context.read<AuthCubit?>()?.state.user?.id,
                  workspaceId: context
                      .read<WorkspaceCubit>()
                      .state
                      .currentWorkspace
                      ?.id,
                  scoped: true,
                ),
              ),
            ),
          ],
        ),
      ],
    );
    if (embedded) return body;
    return AppScaffold(child: body);
  }
}
