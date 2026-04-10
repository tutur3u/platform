import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/staggered_entry.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
        Text(
          title,
          style: theme.typography.large.copyWith(fontWeight: FontWeight.w800),
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
        const shad.Gap(16),
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
        widgets.add(const shad.Gap(12));
      }
      widgets.add(children[index]);
    }
    return widgets;
  }
}

class SettingsTile extends StatelessWidget {
  const SettingsTile({
    required this.icon,
    required this.title,
    this.subtitle,
    this.value,
    this.onTap,
    this.isDestructive = false,
    this.showChevron = true,
    this.trailing,
    super.key,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final String? value;
  final VoidCallback? onTap;
  final bool isDestructive;
  final bool showChevron;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final accentColor = isDestructive
        ? theme.colorScheme.destructive
        : theme.colorScheme.primary;
    final textColor = isDestructive ? theme.colorScheme.destructive : null;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Ink(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: theme.colorScheme.card,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: theme.colorScheme.border.withValues(alpha: 0.72),
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: accentColor.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, size: 20, color: accentColor),
              ),
              const shad.Gap(14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w700,
                        color: textColor,
                      ),
                    ),
                    if (value?.trim().isNotEmpty ?? false) ...[
                      const shad.Gap(4),
                      Text(
                        value!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.typography.base.copyWith(
                          color: textColor ?? theme.colorScheme.foreground,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                    if (subtitle?.trim().isNotEmpty ?? false) ...[
                      const shad.Gap(4),
                      Text(
                        subtitle!,
                        style: theme.typography.textSmall.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const shad.Gap(12),
              trailing ??
                  (showChevron
                      ? Icon(
                          Icons.chevron_right,
                          size: 20,
                          color: theme.colorScheme.mutedForeground,
                        )
                      : const SizedBox.shrink()),
            ],
          ),
        ),
      ),
    );
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

    final workspacePropertiesSubtitle = isWorkspacePermissionLoading
        ? l10n.settingsWorkspacePropertiesPermissionLoading
        : canEditWorkspaceProperties
        ? l10n.settingsWorkspacePropertiesDescription
        : l10n.settingsWorkspacePropertiesNoAccess;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        StaggeredEntry(
          index: 1,
          playOnceKey: 'settings-workspace-context',
          child: SettingsSection(
            title: l10n.settingsWorkspaceSectionManageTitle,
            children: [
              SettingsTile(
                icon: Icons.apartment_rounded,
                title: l10n.settingsCurrentWorkspace,
                subtitle: l10n.settingsCurrentWorkspaceDescription,
                value:
                    currentWorkspace?.name ?? l10n.settingsNoWorkspaceSelected,
                onTap: onSelectCurrentWorkspace,
              ),
              SettingsTile(
                icon: Icons.home_work_outlined,
                title: l10n.settingsDefaultWorkspace,
                subtitle: l10n.settingsDefaultWorkspaceDescription,
                value:
                    workspaceState.defaultWorkspace?.name ??
                    l10n.settingsNoWorkspaceSelected,
                onTap: onSelectDefaultWorkspace,
              ),
              SettingsTile(
                icon: Icons.attach_money_rounded,
                title: l10n.settingsWorkspaceDefaultCurrencyTitle,
                subtitle: canEditWorkspaceDefaultCurrency
                    ? l10n.settingsWorkspaceDefaultCurrencyDescription
                    : l10n.settingsWorkspacePropertiesNoAccess,
                value: isWorkspaceCurrencyLoading
                    ? l10n.settingsWorkspacePropertiesPermissionLoading
                    : (defaultCurrency ?? ''),
                onTap:
                    canEditWorkspaceDefaultCurrency &&
                        !isWorkspaceCurrencyLoading
                    ? onEditWorkspaceDefaultCurrency
                    : null,
              ),
              SettingsTile(
                icon: Icons.drive_file_rename_outline_rounded,
                title: l10n.settingsWorkspacePropertiesTitle,
                subtitle: workspacePropertiesSubtitle,
                value:
                    currentWorkspace?.name ?? l10n.settingsNoWorkspaceSelected,
                onTap:
                    currentWorkspace != null &&
                        !isWorkspacePermissionLoading &&
                        canEditWorkspaceProperties
                    ? () => onEditWorkspaceProperties(currentWorkspace)
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
                  subtitle: canManageWorkspaceMembers
                      ? l10n.settingsWorkspaceMembersSubtitle
                      : l10n.settingsWorkspaceMembersAccessDenied,
                  onTap: canManageWorkspaceMembers
                      ? onOpenWorkspaceMembers
                      : null,
                ),
                SettingsTile(
                  icon: Icons.key_rounded,
                  title: l10n.settingsWorkspaceSecretsTitle,
                  subtitle: canManageWorkspaceSecrets
                      ? l10n.settingsWorkspaceSecretsSubtitle
                      : l10n.settingsWorkspaceSecretsAccessDeniedDescription,
                  onTap: canManageWorkspaceSecrets
                      ? onOpenWorkspaceSecrets
                      : null,
                ),
                SettingsTile(
                  icon: Icons.admin_panel_settings_outlined,
                  title: l10n.settingsWorkspaceRolesTitle,
                  subtitle: canManageWorkspaceRoles
                      ? l10n.settingsWorkspaceRolesSubtitle
                      : l10n.settingsWorkspaceRolesAccessDenied,
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
  const SettingsMetaChip({
    required this.label,
    required this.value,
    super.key,
  });

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
