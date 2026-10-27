import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

class WorkspaceVisibilitySheet extends StatelessWidget {
  const WorkspaceVisibilitySheet({super.key});

  Future<void> _setVisible(
    WorkspaceCubit cubit,
    String id, {
    required bool visible,
  }) async {
    try {
      await cubit.setWorkspaceHidden(id, hidden: !visible);
    } on Object {
      // The cubit restores the previous preference and exposes Retry.
    }
  }

  @override
  Widget build(
    BuildContext context,
  ) => BlocBuilder<WorkspaceCubit, WorkspaceState>(
    builder: (context, state) {
      final l10n = context.l10n;
      final cubit = context.read<WorkspaceCubit>();
      return AppSheetScaffold(
        title: l10n.workspaceManageTitle,
        slivers: [
          if (state.visibilityError != null)
            SliverToBoxAdapter(
              child: AppStateMessage.inline(
                icon: LucideIcons.triangleAlert,
                title: state.visibilityResolved
                    ? l10n.workspaceHiddenUpdateError
                    : l10n.workspaceHiddenLoadError,
                actionLabel: l10n.commonRetry,
                onAction: cubit.refreshHiddenWorkspaces,
              ),
            ),
          if (!state.visibilityResolved &&
              state.visibilityStatus == WorkspaceStatus.loading)
            const SliverToBoxAdapter(child: AppSkeletonRows(count: 4)),
          for (final (title, workspaces, visible) in [
            (l10n.workspaceVisibleTitle, state.visibleWorkspaces, true),
            (l10n.workspaceHiddenTitle, state.hiddenWorkspaces, false),
          ]) ...[
            SliverToBoxAdapter(child: AppSectionHeader(title: title)),
            SliverList.builder(
              itemCount: workspaces.length,
              itemBuilder: (context, index) {
                final workspace = workspaces[index];
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
                  child: AppToggleRow(
                    key: ValueKey('workspace-visible-${workspace.id}'),
                    title: Text(displayWorkspacePickerName(context, workspace)),
                    leading: WorkspaceAvatar(workspace: workspace, radius: 20),
                    value: visible,
                    onChanged:
                        cubit.hasAuthenticatedActor &&
                            state.visibilityResolved &&
                            !state.pendingVisibilityIds.contains(workspace.id)
                        ? (value) => unawaited(
                            _setVisible(cubit, workspace.id, visible: value),
                          )
                        : null,
                  ),
                );
              },
            ),
          ],
        ],
      );
    },
  );
}
