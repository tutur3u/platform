import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// Irreversible workspace actions, shown only to the workspace owner.
class WorkspaceDangerZoneSection extends StatelessWidget {
  const WorkspaceDangerZoneSection({required this.onDelete, super.key});

  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = AppTokens.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(top: AppLayout.sectionGap),
      child: AppGroupedSection(
        caption: l10n.settingsWorkspaceDangerZone,
        children: [
          AppGroupedRow(
            key: const ValueKey('settings-workspace-delete'),
            leading: const AppIconTile(
              icon: LucideIcons.trash2,
              tone: AppTone.destructive,
            ),
            title: Text(
              l10n.settingsWorkspaceDeleteTitle,
              style: TextStyle(color: colors.destructive),
            ),
            showChevron: true,
            onTap: onDelete,
          ),
        ],
      ),
    );
  }
}
