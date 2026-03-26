import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

enum AvatarMenuAction { workspace, profile, settings, logout }

class AvatarDropdownMenuData {
  const AvatarDropdownMenuData({
    required this.name,
    required this.workspaceName,
    this.email,
    this.avatarUrl,
    this.currentWorkspace,
  });

  final String name;
  final String? email;
  final String? avatarUrl;
  final String workspaceName;
  final Workspace? currentWorkspace;
}

class AvatarDropdownTrigger extends StatelessWidget {
  const AvatarDropdownTrigger({
    required this.triggerKey,
    required this.data,
    required this.onPressed,
    super.key,
  });

  final GlobalKey triggerKey;
  final AvatarDropdownMenuData data;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Semantics(
      button: true,
      child: Material(
        key: triggerKey,
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onPressed,
          child: Ink(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: colorScheme.surfaceContainerLow.withValues(alpha: 0.92),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: colorScheme.outlineVariant.withValues(alpha: 0.32),
              ),
            ),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Center(
                  child: _UserAvatar(
                    name: data.name,
                    avatarUrl: data.avatarUrl,
                    size: 28,
                    rounded: 10,
                  ),
                ),
                Positioned(
                  right: 2,
                  bottom: 2,
                  child: Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: colorScheme.primary,
                      shape: BoxShape.circle,
                      border: Border.all(color: colorScheme.surface, width: 2),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

Future<AvatarMenuAction?> showAvatarDropdownMenu({
  required BuildContext context,
  required GlobalKey triggerKey,
  required AvatarDropdownMenuData data,
}) async {
  if (context.isCompact) {
    AvatarMenuAction? selectedAction;

    await showAdaptiveDrawer(
      context: context,
      maxDialogWidth: 420,
      builder: (drawerContext) => _AvatarMenuCompactContent(
        data: data,
        onSelected: (action) async {
          selectedAction = action;
          await dismissAdaptiveDrawerOverlay(drawerContext);
        },
      ),
    );

    return selectedAction;
  }

  final anchorRect = _resolveTriggerRect(context, triggerKey);
  return showDialog<AvatarMenuAction>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.10),
    builder: (dialogContext) => _AvatarMenuDialog(
      anchorRect: anchorRect,
      child: _AvatarMenuDesktopCard(
        data: data,
        onSelected: (action) async {
          Navigator.of(dialogContext, rootNavigator: true).pop(action);
        },
      ),
    ),
  );
}

Rect? _resolveTriggerRect(BuildContext context, GlobalKey triggerKey) {
  final triggerContext = triggerKey.currentContext;
  if (triggerContext == null) {
    return null;
  }

  final triggerRenderBox = triggerContext.findRenderObject();
  final overlayRenderBox = Overlay.of(
    context,
    rootOverlay: true,
  ).context.findRenderObject();

  if (triggerRenderBox is! RenderBox || overlayRenderBox is! RenderBox) {
    return null;
  }

  final offset = triggerRenderBox.localToGlobal(
    Offset.zero,
    ancestor: overlayRenderBox,
  );
  return offset & triggerRenderBox.size;
}

class _AvatarMenuDialog extends StatelessWidget {
  const _AvatarMenuDialog({
    required this.child,
    this.anchorRect,
  });

  final Rect? anchorRect;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = math.min(360, constraints.maxWidth - 24).toDouble();
          final maxLeft = math
              .max(12, constraints.maxWidth - width - 12)
              .toDouble();
          final preferredLeft = anchorRect != null
              ? anchorRect!.right - width
              : maxLeft;
          final left = preferredLeft < 12
              ? 12.0
              : preferredLeft > maxLeft
              ? maxLeft
              : preferredLeft;
          final top = anchorRect != null
              ? math.max(16, anchorRect!.bottom + 10)
              : 24;

          return Stack(
            children: [
              Positioned.fill(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => Navigator.of(context, rootNavigator: true).pop(),
                ),
              ),
              Positioned(
                left: left,
                top: top.toDouble(),
                width: width,
                child: SafeArea(
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      maxHeight: constraints.maxHeight - top.toDouble() - 16,
                    ),
                    child: child,
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _AvatarMenuCompactContent extends StatelessWidget {
  const _AvatarMenuCompactContent({
    required this.data,
    required this.onSelected,
  });

  final AvatarDropdownMenuData data;
  final Future<void> Function(AvatarMenuAction action) onSelected;

  @override
  Widget build(BuildContext context) {
    final maxHeight = MediaQuery.sizeOf(context).height * 0.78;

    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxHeight),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
        child: _AvatarMenuContent(
          data: data,
          compact: true,
          onSelected: onSelected,
        ),
      ),
    );
  }
}

class _AvatarMenuDesktopCard extends StatelessWidget {
  const _AvatarMenuDesktopCard({
    required this.data,
    required this.onSelected,
  });

  final AvatarDropdownMenuData data;
  final Future<void> Function(AvatarMenuAction action) onSelected;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Material(
      color: Colors.transparent,
      child: Container(
        decoration: BoxDecoration(
          color: colorScheme.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(
            color: colorScheme.outlineVariant.withValues(alpha: 0.22),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.12),
              blurRadius: 28,
              offset: const Offset(0, 14),
            ),
          ],
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(18),
          child: _AvatarMenuContent(
            data: data,
            compact: false,
            onSelected: onSelected,
          ),
        ),
      ),
    );
  }
}

class _AvatarMenuContent extends StatelessWidget {
  const _AvatarMenuContent({
    required this.data,
    required this.compact,
    required this.onSelected,
  });

  final AvatarDropdownMenuData data;
  final bool compact;
  final Future<void> Function(AvatarMenuAction action) onSelected;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _AccountHeader(data: data, compact: compact),
        const shad.Gap(14),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            context.l10n.settingsCurrentWorkspace,
            style: theme.typography.small.copyWith(
              color: colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.3,
            ),
          ),
        ),
        const shad.Gap(10),
        _WorkspaceCard(
          data: data,
          onTap: () => onSelected(AvatarMenuAction.workspace),
        ),
        const shad.Gap(16),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            context.l10n.settingsAccountSectionTitle,
            style: theme.typography.small.copyWith(
              color: colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.3,
            ),
          ),
        ),
        const shad.Gap(10),
        _ActionGroup(
          children: [
            _ActionTile(
              icon: Icons.person_outline_rounded,
              title: context.l10n.settingsProfile,
              subtitle: context.l10n.settingsProfileDescription,
              onTap: () => onSelected(AvatarMenuAction.profile),
            ),
            const _ActionDivider(),
            _ActionTile(
              icon: Icons.settings_outlined,
              title: context.l10n.settingsTitle,
              subtitle: context.l10n.settingsPreferencesSectionDescription,
              onTap: () => onSelected(AvatarMenuAction.settings),
            ),
          ],
        ),
        const shad.Gap(14),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Divider(
            height: 1,
            color: colorScheme.outlineVariant.withValues(alpha: 0.18),
          ),
        ),
        const shad.Gap(14),
        _ActionGroup(
          children: [
            _ActionTile(
              icon: Icons.logout_rounded,
              title: context.l10n.authLogOut,
              subtitle: context.l10n.settingsSignOutDescription,
              destructive: true,
              onTap: () => onSelected(AvatarMenuAction.logout),
            ),
          ],
        ),
      ],
    );
  }
}

class _AccountHeader extends StatelessWidget {
  const _AccountHeader({
    required this.data,
    required this.compact,
  });

  final AvatarDropdownMenuData data;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);

    return Padding(
      padding: EdgeInsets.fromLTRB(compact ? 2 : 4, 0, compact ? 2 : 4, 0),
      child: Row(
        children: [
          _UserAvatar(
            name: data.name,
            avatarUrl: data.avatarUrl,
            size: compact ? 54 : 52,
            rounded: 18,
          ),
          const shad.Gap(14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  data.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (data.email?.trim().isNotEmpty ?? false) ...[
                  const shad.Gap(2),
                  Text(
                    data.email!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.small.copyWith(
                      color: colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _WorkspaceCard extends StatelessWidget {
  const _WorkspaceCard({
    required this.data,
    required this.onTap,
  });

  final AvatarDropdownMenuData data;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);
    final workspace = data.currentWorkspace;
    final workspaceTitle = _workspaceTitle(context, workspace);
    final workspaceDescription = _workspaceDescription(context, workspace);

    return _InteractiveCard(
      onTap: onTap,
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Row(
            children: [
              if (workspace?.personal ?? false)
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(
                    Icons.person_outline_rounded,
                    size: 22,
                    color: colorScheme.primary,
                  ),
                )
              else if (workspace != null)
                WorkspaceAvatar(workspace: workspace, radius: 22)
              else
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(
                    Icons.workspaces_outlined,
                    size: 22,
                    color: colorScheme.primary,
                  ),
                ),
              const shad.Gap(12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      workspaceTitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const shad.Gap(4),
                    Text(
                      workspaceDescription,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.small.copyWith(
                        color: colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const shad.Gap(8),
              Icon(
                Icons.chevron_right_rounded,
                size: 22,
                color: colorScheme.onSurfaceVariant,
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _workspaceDescription(BuildContext context, Workspace? workspace) {
    if (workspace == null) {
      return context.l10n.settingsSwitchWorkspaceDescription;
    }
    if (workspace.personal) {
      return context.l10n.workspacePersonalSection;
    }
    if (isSystemWorkspace(workspace)) {
      return context.l10n.workspaceSystemBadge;
    }
    return context.l10n.settingsSwitchWorkspaceDescription;
  }

  String _workspaceTitle(BuildContext context, Workspace? workspace) {
    if (workspace?.personal ?? false) {
      return context.l10n.workspacePersonalSection;
    }
    return data.workspaceName;
  }
}

class _ActionGroup extends StatelessWidget {
  const _ActionGroup({
    required this.children,
  });

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: colorScheme.outlineVariant.withValues(alpha: 0.18),
        ),
      ),
      child: Column(children: children),
    );
  }
}

class _ActionDivider extends StatelessWidget {
  const _ActionDivider();

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Divider(
        height: 1,
        color: colorScheme.outlineVariant.withValues(alpha: 0.18),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.destructive = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);
    final accent = destructive ? colorScheme.error : colorScheme.primary;
    final foreground = destructive ? colorScheme.error : colorScheme.onSurface;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: destructive
                ? colorScheme.errorContainer.withValues(alpha: 0.30)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(22),
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: destructive ? 0.14 : 0.10),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, size: 20, color: accent),
              ),
              const shad.Gap(12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.typography.large.copyWith(
                        color: foreground,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const shad.Gap(3),
                    Text(
                      subtitle,
                      style: theme.typography.small.copyWith(
                        color: destructive
                            ? colorScheme.error.withValues(alpha: 0.82)
                            : colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const shad.Gap(8),
              Icon(
                destructive
                    ? Icons.logout_rounded
                    : Icons.arrow_outward_rounded,
                size: 18,
                color: destructive
                    ? colorScheme.error.withValues(alpha: 0.84)
                    : colorScheme.onSurfaceVariant,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InteractiveCard extends StatelessWidget {
  const _InteractiveCard({
    required this.child,
    required this.onTap,
    this.padding = const EdgeInsets.all(14),
  });

  final Widget child;
  final VoidCallback onTap;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: Ink(
          padding: padding,
          decoration: BoxDecoration(
            color: colorScheme.surfaceContainerLow,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: colorScheme.outlineVariant.withValues(alpha: 0.18),
            ),
          ),
          child: child,
        ),
      ),
    );
  }
}

class _UserAvatar extends StatelessWidget {
  const _UserAvatar({
    required this.name,
    this.avatarUrl,
    this.size = 36,
    this.rounded = 12,
  });

  final String name;
  final String? avatarUrl;
  final double size;
  final double rounded;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);

    return ClipRRect(
      borderRadius: BorderRadius.circular(rounded),
      child: Container(
        width: size,
        height: size,
        color: colorScheme.surfaceContainerHighest,
        child: avatarUrl != null && avatarUrl!.trim().isNotEmpty
            ? Image.network(
                avatarUrl!,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => _AvatarFallback(
                  name: name,
                  textStyle: theme.typography.small,
                ),
              )
            : _AvatarFallback(
                name: name,
                textStyle: theme.typography.small,
              ),
      ),
    );
  }
}

class _AvatarFallback extends StatelessWidget {
  const _AvatarFallback({
    required this.name,
    required this.textStyle,
  });

  final String name;
  final TextStyle textStyle;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Center(
      child: Text(
        _initials(name),
        style: textStyle.copyWith(
          color: colorScheme.onSurface,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  String _initials(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) {
      return 'U';
    }

    final parts = trimmed.split(RegExp(r'\s+'));
    if (parts.length == 1) {
      return parts.first.characters.first.toUpperCase();
    }

    final first = parts.first.characters.first.toUpperCase();
    final last = parts.last.characters.first.toUpperCase();
    return '$first$last';
  }
}
