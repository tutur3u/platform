import 'package:flutter/material.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
import 'package:mobile/features/workspace/widgets/workspace_tier_badge.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

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

  @override
  Widget build(BuildContext context) {
    final colors = DynamicColors.of(context);
    final accent = workspace.personal
        ? colors.purple
        : isSystemWorkspace(workspace)
        ? colors.blue
        : colors.green;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Semantics(
        selected: selected,
        child: Material(
          color: accent.withValues(alpha: selected ? 0.18 : 0.10),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: BorderSide(
              color: accent.withValues(alpha: selected ? 0.65 : 0.30),
            ),
          ),
          clipBehavior: Clip.antiAlias,
          child: Row(
            children: [
              Expanded(
                child: InkWell(
                  onTap: pending ? null : onSelect,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        WorkspaceAvatar(workspace: workspace, radius: 22),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                displayWorkspacePickerName(context, workspace),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 4),
                              Wrap(
                                spacing: 8,
                                runSpacing: 4,
                                children: [
                                  WorkspaceTierBadge(tier: workspace.tier),
                                  if (current)
                                    Text(context.l10n.workspaceCurrentBadge),
                                  if (isDefault)
                                    Text(context.l10n.workspaceDefaultBadge),
                                ],
                              ),
                            ],
                          ),
                        ),
                        if (selected) const Icon(Icons.check_rounded),
                      ],
                    ),
                  ),
                ),
              ),
              if (onVisibility != null)
                IconButton(
                  style: IconButton.styleFrom(
                    foregroundColor: accent,
                    backgroundColor: accent.withValues(alpha: 0.12),
                  ),
                  tooltip:
                      '$actionLabel: '
                      '${displayWorkspacePickerName(context, workspace)}',
                  onPressed: pending ? null : onVisibility,
                  icon: pending
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Icon(
                          actionLabel == context.l10n.workspaceRestoreAction
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                        ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
