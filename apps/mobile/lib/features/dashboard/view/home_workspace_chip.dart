import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

/// A workspace chip: tap selects, long press pins or unpins.
class HomeWorkspaceChip extends StatelessWidget {
  const HomeWorkspaceChip({
    required this.workspace,
    required this.selected,
    required this.pinned,
    required this.onTap,
    required this.onTogglePin,
    super.key,
  });

  final Workspace workspace;
  final bool selected;
  final bool pinned;
  final VoidCallback onTap;

  /// Null when pins do not apply (fewer than five workspaces) or are not
  /// loaded yet.
  final VoidCallback? onTogglePin;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final name = displayWorkspaceName(context, workspace);
    return Semantics(
      button: true,
      selected: selected,
      label: name,
      excludeSemantics: true,
      onTap: onTap,
      customSemanticsActions: onTogglePin == null
          ? null
          : {
              CustomSemanticsAction(
                label: pinned ? l10n.homeWorkspaceUnpin : l10n.homeWorkspacePin,
              ): onTogglePin!,
            },
      child: _ChipFrame(
        key: ValueKey('home-workspace-chip-${workspace.id}'),
        selected: selected,
        onTap: onTap,
        onLongPress: onTogglePin,
        leading: WorkspaceAvatar(workspace: workspace, radius: 11),
        label: name,
      ),
    );
  }
}

/// The trailing More chip.
class HomeWorkspaceMoreChip extends StatelessWidget {
  const HomeWorkspaceMoreChip({required this.onTap, super.key});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final label = context.l10n.homeWorkspaceMore;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      onTap: onTap,
      child: _ChipFrame(
        key: const ValueKey('home-workspace-chip-more'),
        selected: false,
        onTap: onTap,
        label: label,
        trailing: LucideIcons.chevronDown,
      ),
    );
  }
}

/// A 44dp pill with an optional leading widget and trailing icon. Long
/// names ellipsize inside a bounded width; the row itself scrolls, so
/// enlarged text never clips a chip.
class _ChipFrame extends StatelessWidget {
  const _ChipFrame({
    required this.selected,
    required this.onTap,
    required this.label,
    this.onLongPress,
    this.leading,
    this.trailing,
    super.key,
  });

  final bool selected;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;
  final String label;
  final Widget? leading;
  final IconData? trailing;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final radius = BorderRadius.circular(AppRadius.pill);
    final ink = selected ? c.primaryForeground : c.foreground;
    return Material(
      color: selected ? c.primary : c.card,
      shape: RoundedRectangleBorder(
        borderRadius: radius,
        side: BorderSide(
          color: selected ? c.primary : c.border.withValues(alpha: 0.7),
        ),
      ),
      child: InkWell(
        borderRadius: radius,
        onTap: onTap,
        onLongPress: onLongPress,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
          child: Padding(
            padding: EdgeInsetsDirectional.fromSTEB(
              leading == null ? AppSpacing.md : AppSpacing.xs,
              AppSpacing.xs,
              AppSpacing.md,
              AppSpacing.xs,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (leading != null) ...[
                  leading!,
                  const SizedBox(width: AppSpacing.sm),
                ],
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 180),
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: tokens.typography.small.copyWith(
                      color: ink,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                if (trailing != null) ...[
                  const SizedBox(width: AppSpacing.xs),
                  Icon(trailing, size: 16, color: ink),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
