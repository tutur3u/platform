import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/settings/view/cache_storage_sheet.dart';
import 'package:mobile/features/settings/view/offline_changes_sheet.dart';
import 'package:mobile/features/settings/view/offline_preparation_section.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// Shell owners can embed this body without creating competing app chrome.
class OfflinePage extends StatelessWidget {
  const OfflinePage({this.embedded = false, super.key});
  final bool embedded;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final body = ListView(
      padding: const EdgeInsets.all(20),
      children: [
        if (embedded)
          Row(
            children: [
              IconButton(
                tooltip: MaterialLocalizations.of(context).backButtonTooltip,
                onPressed: () => Navigator.of(context).maybePop(),
                icon: const Icon(Icons.arrow_back),
              ),
              Expanded(
                child: Text(
                  l10n.offlineSectionTitle,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
              ),
            ],
          ),
        Text(l10n.offlineSectionDescription),
        const SizedBox(height: 20),
        const OfflinePreparationSection(showModuleDetails: true),
        const SizedBox(height: 24),
        SettingsCompactSection(
          title: l10n.offlinePreferencesTitle,
          children: [
            SettingsTile(
              grouped: true,
              wrapSupportingText: true,
              icon: Icons.storage_outlined,
              title: l10n.cacheStorageTitle,
              subtitle: l10n.offlineStorageScope,
              onTap: () => unawaited(showCacheStorageSheet(context)),
            ),
            SettingsTile(
              grouped: true,
              icon: Icons.sync_rounded,
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
    return Scaffold(
      appBar: AppBar(title: Text(l10n.offlineSectionTitle)),
      body: body,
    );
  }
}
