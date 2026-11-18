import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';

/// One workspace in the picker: identity tile, name, a tier marker for paid
/// tiers and a check on the selected row. A choice in a radio group.
///
/// Place it in an `AppGroupedSlice` so consecutive rows draw one card.
class WorkspacePickerRow extends StatelessWidget {
  const WorkspacePickerRow({
    required this.workspace,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final Workspace workspace;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final name = displayWorkspacePickerName(context, workspace);
    final tier = workspaceTierLabel(workspace.tier);
    return Semantics(
      button: true,
      selected: selected,
      inMutuallyExclusiveGroup: true,
      label: tier == null ? name : '$name, $tier',
      excludeSemantics: true,
      onTap: onTap,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.sm),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 56),
            child: Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(
                AppSpacing.md,
                AppSpacing.sm,
                AppSpacing.xs,
                AppSpacing.sm,
              ),
              child: Row(
                children: [
                  WorkspaceAvatar(workspace: workspace, radius: 16),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Row(
                      children: [
                        Flexible(
                          child: Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: tokens.typography.base.copyWith(
                              color: c.foreground,
                              fontWeight: selected
                                  ? FontWeight.w600
                                  : FontWeight.w500,
                            ),
                          ),
                        ),
                        if (tier != null) ...[
                          const SizedBox(width: AppSpacing.sm),
                          WorkspaceTierMarker(label: tier),
                        ],
                      ],
                    ),
                  ),
                  SizedBox(
                    width: 40,
                    child: selected
                        ? Icon(AppIcons.check, color: c.primary, size: 20)
                        : null,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The visible tier name for a paid [tier], or null for Free.
String? workspaceTierLabel(String tier) {
  final normalized = normalizeWorkspaceTier(tier);
  if (normalized == workspaceTierFree) return null;
  return '${normalized[0]}${normalized.substring(1).toLowerCase()}';
}

/// A small outlined tier marker, such as "Pro".
class WorkspaceTierMarker extends StatelessWidget {
  const WorkspaceTierMarker({required this.label, super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppRadius.xs),
        border: Border.all(color: c.border),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
        child: Text(
          label,
          style: tokens.typography.xSmall.copyWith(
            color: c.mutedForeground,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}
