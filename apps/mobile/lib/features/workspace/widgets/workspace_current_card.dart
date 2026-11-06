import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
import 'package:mobile/features/workspace/widgets/workspace_selection_mark.dart';
import 'package:mobile/features/workspace/widgets/workspace_tier_badge.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

/// The selected workspace, pinned above the picker's results and washed in
/// its brand colour so the active scope is obvious at a glance.
class WorkspaceCurrentCard extends StatelessWidget {
  const WorkspaceCurrentCard({
    required this.workspace,
    required this.label,
    required this.isDefault,
    this.onTap,
    super.key,
  });

  final Workspace workspace;

  /// Eyebrow naming what the selection is, such as "Current workspace".
  final String label;
  final bool isDefault;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final accent = workspaceAccent(workspace);
    final fill = accent.fill(c.brightness);
    final solid = MediaQuery.highContrastOf(context);
    final radius = BorderRadius.circular(AppRadius.card);
    final kind = workspace.personal
        ? l10n.workspacePersonalBadge
        : isSystemWorkspace(workspace)
        ? l10n.workspaceSystemBadge
        : l10n.workspacePickerTeamBadge;
    final name = displayWorkspacePickerName(context, workspace);
    return Semantics(
      selected: true,
      button: onTap != null,
      label: '$label, $name',
      excludeSemantics: true,
      onTap: onTap,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: radius,
          color: Color.alphaBlend(
            accent.tint(c.brightness),
            c.card.withValues(alpha: solid ? 1 : 0.92),
          ),
          border: Border.all(color: fill.withValues(alpha: 0.55)),
        ),
        child: Material(
          type: MaterialType.transparency,
          borderRadius: radius,
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Row(
                children: [
                  WorkspaceAvatar(workspace: workspace, radius: 28),
                  const SizedBox(width: AppSpacing.lg),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                color: fill,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: AppSpacing.xs + 2),
                            Flexible(
                              child: Text(
                                label,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: tokens.typography.small.copyWith(
                                  color: c.foreground,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        Text(
                          name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: tokens.typography.large.copyWith(
                            color: c.foreground,
                            fontWeight: FontWeight.w700,
                            height: 1.2,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        Wrap(
                          spacing: AppSpacing.xs + AppSpacing.xxs,
                          runSpacing: AppSpacing.xs,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            WorkspaceTierBadge(tier: workspace.tier),
                            AppBadge.outline(child: Text(kind)),
                            if (isDefault)
                              AppBadge.outline(
                                child: Text(l10n.workspaceDefaultBadge),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  WorkspaceSelectionMark(accent: accent, size: 28),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
