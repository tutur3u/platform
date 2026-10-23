import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_tile.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';
import 'package:mobile/widgets/staggered_entry.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

export 'package:mobile/features/settings/view/settings_tile.dart';

class SettingsPanel extends StatelessWidget {
  const SettingsPanel({
    required this.child,
    this.padding = const EdgeInsets.all(18),
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.75),
        ),
      ),
      padding: padding,
      child: child,
    );
  }
}

/// Sections inherit the page surface; separators establish a quiet hierarchy.
class SettingsGroup extends StatelessWidget {
  const SettingsGroup({required this.children, super.key});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return ClipRRect(
      borderRadius: BorderRadius.circular(17),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(17),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var index = 0; index < children.length; index++) ...[
              if (index > 0)
                Divider(
                  height: 1,
                  indent: SettingsRowLayout.inset,
                  endIndent: SettingsRowLayout.inset,
                  color: theme.colorScheme.border.withValues(alpha: 0.7),
                ),
              children[index],
            ],
          ],
        ),
      ),
    );
  }
}

/// Root navigation groups use the same quiet heading and shared row surface.
class SettingsCompactSection extends StatelessWidget {
  const SettingsCompactSection({
    required this.title,
    required this.children,
    this.columnSplit,
    super.key,
  });

  final String title;
  final List<Widget> children;

  /// Expanded layouts retain the same compact groups in two columns.
  final int? columnSplit;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: SettingsRowLayout.inset,
        ),
        child: Text(
          title,
          style: shad.Theme.of(context).typography.small.copyWith(
            fontWeight: FontWeight.w600,
            color: shad.Theme.of(context).colorScheme.mutedForeground,
          ),
        ),
      ),
      const shad.Gap(6),
      if (columnSplit case final split?)
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: SettingsGroup(children: children.take(split).toList()),
            ),
            const shad.Gap(16),
            Expanded(
              child: SettingsGroup(children: children.skip(split).toList()),
            ),
          ],
        )
      else
        SettingsGroup(children: children),
    ],
  );
}

class SettingsSection extends StatelessWidget {
  const SettingsSection({
    required this.title,
    required this.children,
    this.description,
    super.key,
  });

  final String title;
  final String? description;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (title.trim().isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: SettingsRowLayout.inset,
            ),
            child: Text(
              title,
              style: theme.typography.small.copyWith(
                fontWeight: FontWeight.w600,
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          ),
        if (description?.trim().isNotEmpty ?? false) ...[
          const shad.Gap(6),
          Text(
            description!,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
        ],
        if (title.trim().isNotEmpty || description?.trim().isNotEmpty == true)
          const shad.Gap(8),
        ..._withSpacing(children),
      ],
    );
  }

  List<Widget> _withSpacing(List<Widget> children) {
    if (children.isEmpty) {
      return const [];
    }

    final widgets = <Widget>[];
    for (var index = 0; index < children.length; index++) {
      if (index > 0) {
        widgets.add(const shad.Gap(6));
      }
      widgets.add(children[index]);
    }
    return widgets;
  }
}

class SettingsWorkspaceSection extends StatelessWidget {
  const SettingsWorkspaceSection({
    required this.onSelectCurrentWorkspace,
    required this.onSelectDefaultWorkspace,
    required this.canEditWorkspaceProperties,
    required this.isWorkspacePermissionLoading,
    required this.onEditWorkspaceProperties,
    required this.defaultCurrency,
    required this.canEditWorkspaceDefaultCurrency,
    required this.isWorkspaceCurrencyLoading,
    required this.onEditWorkspaceDefaultCurrency,
    required this.canManageWorkspaceMembers,
    required this.canManageWorkspaceSecrets,
    required this.canManageWorkspaceRoles,
    required this.onOpenWorkspaceSecrets,
    required this.onOpenWorkspaceMembers,
    required this.onOpenWorkspaceRoles,
    required this.showWorkspaceAccess,
    super.key,
  });

  final VoidCallback onSelectCurrentWorkspace;
  final VoidCallback onSelectDefaultWorkspace;
  final bool canEditWorkspaceProperties;
  final bool isWorkspacePermissionLoading;
  final ValueChanged<Workspace> onEditWorkspaceProperties;
  final String? defaultCurrency;
  final bool canEditWorkspaceDefaultCurrency;
  final bool isWorkspaceCurrencyLoading;
  final VoidCallback onEditWorkspaceDefaultCurrency;
  final bool canManageWorkspaceMembers;
  final bool canManageWorkspaceSecrets;
  final bool canManageWorkspaceRoles;
  final VoidCallback onOpenWorkspaceSecrets;
  final VoidCallback onOpenWorkspaceMembers;
  final VoidCallback onOpenWorkspaceRoles;
  final bool showWorkspaceAccess;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final workspaceState = context.watch<WorkspaceCubit>().state;
    final currentWorkspace = workspaceState.currentWorkspace;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        StaggeredEntry(
          index: 1,
          playOnceKey: 'settings-workspace-context',
          child: SettingsSection(
            title: '',
            children: [
              PendingSyncFrame(
                workspaceId: currentWorkspace?.id ?? 'personal',
                entityId: currentWorkspace?.id ?? '',
                feature: 'workspace',
                child: SettingsTile(
                  icon: Icons.apartment_rounded,
                  title: l10n.settingsCurrentWorkspace,
                  value:
                      currentWorkspace?.name ??
                      l10n.settingsNoWorkspaceSelected,
                  onTap: onSelectCurrentWorkspace,
                ),
              ),
              PendingSyncFrame(
                workspaceId: workspaceState.defaultWorkspace?.id ?? 'personal',
                entityId: workspaceState.defaultWorkspace?.id ?? '',
                feature: 'workspace',
                child: SettingsTile(
                  icon: Icons.home_work_outlined,
                  title: l10n.settingsDefaultWorkspace,
                  value:
                      workspaceState.defaultWorkspace?.name ??
                      l10n.settingsNoWorkspaceSelected,
                  onTap: onSelectDefaultWorkspace,
                ),
              ),
              PendingSyncFrame(
                workspaceId: currentWorkspace?.id ?? 'personal',
                entityId: currentWorkspace?.id ?? '',
                feature: 'finance',
                child: SettingsTile(
                  icon: Icons.attach_money_rounded,
                  title: l10n.settingsWorkspaceDefaultCurrencyTitle,
                  value: isWorkspaceCurrencyLoading
                      ? '…'
                      : (defaultCurrency ?? ''),
                  onTap:
                      canEditWorkspaceDefaultCurrency &&
                          !isWorkspaceCurrencyLoading
                      ? onEditWorkspaceDefaultCurrency
                      : null,
                ),
              ),
              PendingSyncFrame(
                workspaceId: currentWorkspace?.id ?? 'personal',
                entityId: currentWorkspace?.id ?? '',
                feature: 'workspace',
                child: SettingsTile(
                  icon: Icons.drive_file_rename_outline_rounded,
                  title: l10n.settingsWorkspacePropertiesTitle,
                  value:
                      currentWorkspace?.name ??
                      l10n.settingsNoWorkspaceSelected,
                  onTap:
                      currentWorkspace != null &&
                          !isWorkspacePermissionLoading &&
                          canEditWorkspaceProperties
                      ? () => onEditWorkspaceProperties(currentWorkspace)
                      : null,
                ),
              ),
              SettingsTile(
                icon: Icons.key_rounded,
                title: l10n.settingsWorkspaceSecretsTitle,
                onTap: canManageWorkspaceSecrets
                    ? onOpenWorkspaceSecrets
                    : null,
              ),
            ],
          ),
        ),
        if (showWorkspaceAccess) ...[
          const shad.Gap(18),
          StaggeredEntry(
            index: 2,
            playOnceKey: 'settings-workspace-access',
            child: SettingsSection(
              title: l10n.settingsWorkspaceAccessTitle,
              children: [
                SettingsTile(
                  icon: Icons.group_outlined,
                  title: l10n.settingsWorkspaceMembersTitle,
                  onTap: canManageWorkspaceMembers
                      ? onOpenWorkspaceMembers
                      : null,
                ),
                SettingsTile(
                  icon: Icons.admin_panel_settings_outlined,
                  title: l10n.settingsWorkspaceRolesTitle,
                  onTap: canManageWorkspaceRoles ? onOpenWorkspaceRoles : null,
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class SettingsMetaChip extends StatelessWidget {
  const SettingsMetaChip({required this.label, required this.value, super.key});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.background.withValues(alpha: 0.72),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.65),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: theme.typography.xSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(2),
          Text(
            value,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.typography.small.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}
