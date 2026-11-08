import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
import 'package:mobile/features/workspace/widgets/workspace_selection_mark.dart';
import 'package:mobile/features/workspace/widgets/workspace_tier_badge.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

/// One workspace in the picker or the selection page: identity tile, name,
/// tier and status badges, and a selection mark in the workspace's colour.
///
/// Place it in an `AppGroupedSlice` so consecutive rows draw one card.
class WorkspaceResultTile extends StatelessWidget {
  const WorkspaceResultTile({
    required this.workspace,
    required this.selected,
    required this.current,
    required this.isDefault,
    required this.pending,
    required this.onSelect,
    required this.onVisibility,
    required this.actionLabel,
    this.loading = false,
    super.key,
  });
  final Workspace workspace;
  final bool selected;
  final bool current;
  final bool isDefault;
  final bool pending;
  final VoidCallback? onSelect;
  final VoidCallback? onVisibility;
  final String actionLabel;

  /// Shows progress in the trailing slot while this workspace is opening.
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final accent = workspaceAccent(workspace);
    final name = displayWorkspacePickerName(context, workspace);
    final restore = actionLabel == l10n.workspaceRestoreAction;
    final row = Container(
      constraints: const BoxConstraints(minHeight: 64),
      padding: const EdgeInsetsDirectional.fromSTEB(
        AppLayout.rowHorizontalPadding,
        AppSpacing.md,
        AppSpacing.sm,
        AppSpacing.md,
      ),
      child: Row(
        children: [
          WorkspaceAvatar(workspace: workspace, radius: 20),
          const SizedBox(width: AppLayout.rowLeadingGap),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: tokens.typography.base.copyWith(
                    color: c.foreground,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Wrap(
                  spacing: AppSpacing.xs + AppSpacing.xxs,
                  runSpacing: AppSpacing.xs,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    WorkspaceTierBadge(tier: workspace.tier),
                    if (current && !selected)
                      AppBadge.outline(child: Text(l10n.workspaceCurrentBadge)),
                    if (isDefault)
                      AppBadge.outline(child: Text(l10n.workspaceDefaultBadge)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          if (loading)
            const SizedBox.square(
              dimension: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          else if (selected)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
              child: WorkspaceSelectionMark(accent: accent),
            ),
        ],
      ),
    );
    final tappable = onSelect == null
        ? row
        : InkWell(onTap: pending || loading ? null : onSelect, child: row);
    return Semantics(
      selected: selected,
      button: onSelect != null,
      child: AnimatedContainer(
        duration: AppMotion.fast,
        curve: AppMotion.standard,
        color: selected ? accent.tint(c.brightness) : Colors.transparent,
        child: Row(
          children: [
            Expanded(child: tappable),
            if (onVisibility != null)
              Padding(
                padding: const EdgeInsetsDirectional.only(end: AppSpacing.xs),
                child: IconButton(
                  style: IconButton.styleFrom(
                    foregroundColor: c.mutedForeground,
                    minimumSize: const Size(44, 44),
                    padding: EdgeInsets.zero,
                    tapTargetSize: MaterialTapTargetSize.padded,
                  ),
                  tooltip: '$actionLabel: $name',
                  onPressed: pending ? null : onVisibility,
                  icon: pending
                      ? const SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Icon(
                          restore ? LucideIcons.eye : LucideIcons.eyeOff,
                          size: 18,
                        ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
