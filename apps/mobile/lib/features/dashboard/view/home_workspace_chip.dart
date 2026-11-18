import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

/// Key of the Home workspace chip's 48dp tap target.
const homeWorkspaceChipKey = ValueKey<String>('home-workspace-chip');

/// The current workspace as one small chip under the Home greeting. Home's
/// counts and lists belong to this workspace; tapping the chip opens the
/// workspace picker.
class HomeWorkspaceChip extends StatelessWidget {
  const HomeWorkspaceChip({super.key});

  @override
  Widget build(BuildContext context) =>
      BlocBuilder<WorkspaceCubit, WorkspaceState>(
        buildWhen: (previous, current) =>
            previous.currentWorkspace != current.currentWorkspace,
        builder: (context, state) {
          final workspace = state.currentWorkspace;
          if (workspace == null) return const SizedBox.shrink();
          final tokens = AppTokens.of(context);
          final c = tokens.colorScheme;
          final name = displayWorkspaceNameOrFallback(context, workspace);
          final radius = BorderRadius.circular(AppRadius.pill);
          void open() => showWorkspacePickerSheet(context);
          return Align(
            alignment: AlignmentDirectional.centerStart,
            child: Semantics(
              button: true,
              label: name,
              hint: context.l10n.settingsSwitchWorkspace,
              excludeSemantics: true,
              onTap: open,
              // The pill stays 36dp tall; its hit region is padded to 48dp.
              child: AppTapTarget(
                key: homeWorkspaceChipKey,
                child: Material(
                  color: c.card,
                  shape: RoundedRectangleBorder(
                    borderRadius: radius,
                    side: BorderSide(color: c.border.withValues(alpha: 0.7)),
                  ),
                  child: InkWell(
                    borderRadius: radius,
                    onTap: open,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 36),
                      child: Padding(
                        padding: const EdgeInsetsDirectional.fromSTEB(
                          AppSpacing.xs,
                          AppSpacing.xxs,
                          AppSpacing.sm,
                          AppSpacing.xxs,
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            WorkspaceAvatar(workspace: workspace, radius: 11),
                            const SizedBox(width: AppSpacing.sm),
                            ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 220),
                              child: Text(
                                name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: tokens.typography.small.copyWith(
                                  color: c.foreground,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            const SizedBox(width: AppSpacing.xs),
                            Icon(
                              LucideIcons.chevronDown,
                              size: 16,
                              color: c.mutedForeground,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      );
}
