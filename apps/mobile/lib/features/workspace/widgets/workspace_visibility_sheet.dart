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

class WorkspaceVisibilitySheet extends StatefulWidget {
  const WorkspaceVisibilitySheet({super.key});

  @override
  State<WorkspaceVisibilitySheet> createState() =>
      _WorkspaceVisibilitySheetState();
}

class _WorkspaceVisibilitySheetState extends State<WorkspaceVisibilitySheet> {
  final _search = TextEditingController();

  @override
  void dispose() {
    final search = _search;
    WidgetsBinding.instance.addPostFrameCallback((_) => search.dispose());
    super.dispose();
  }

  Future<void> _setVisible(
    WorkspaceCubit cubit,
    String id, {
    required bool visible,
  }) async {
    final wasCurrent = cubit.state.currentWorkspace?.id == id;
    try {
      await cubit.setWorkspaceHidden(id, hidden: !visible);
      if (!mounted || !cubit.hasAuthenticatedActor) return;
      if (visible && cubit.state.currentWorkspace == null) {
        final restored = cubit.state.visibleWorkspaces
            .where((workspace) => workspace.id == id)
            .firstOrNull;
        if (restored != null) await cubit.selectWorkspace(restored);
      } else if (!visible &&
          wasCurrent &&
          cubit.state.hiddenWorkspaceIds.contains(id)) {
        showAppToast(
          context,
          message: cubit.state.visibleWorkspaces.isEmpty
              ? context.l10n.workspaceHiddenLastToast
              : context.l10n.workspaceHiddenCurrentToast,
        );
      }
    } on Object {
      // The cubit restores the previous preference and exposes Retry.
    }
  }

  @override
  Widget build(BuildContext context) =>
      BlocBuilder<WorkspaceCubit, WorkspaceState>(
        builder: (context, state) {
          final l10n = context.l10n;
          final cubit = context.read<WorkspaceCubit>();
          final query = _search.text.trim().toLowerCase();
          final sections =
              [
                    (l10n.workspaceVisibleTitle, state.visibleWorkspaces, true),
                    (l10n.workspaceHiddenTitle, state.hiddenWorkspaces, false),
                  ]
                  .map(
                    (section) => (
                      section.$1,
                      section.$2
                          .where(
                            (workspace) =>
                                query.isEmpty ||
                                [
                                  displayWorkspacePickerName(
                                    context,
                                    workspace,
                                  ),
                                  workspace.name,
                                  workspace.id,
                                ].whereType<String>().any(
                                  (value) =>
                                      value.toLowerCase().contains(query),
                                ),
                          )
                          .toList(),
                      section.$3,
                    ),
                  )
                  .toList();
          final loading =
              !state.visibilityResolved &&
              state.visibilityStatus == WorkspaceStatus.loading;
          return AppSheetScaffold(
            title: l10n.workspaceManageTitle,
            search: AppSheetSearch(
              controller: _search,
              hint: l10n.workspacePickerSearchHint,
              onChanged: (_) => setState(() {}),
            ),
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
              if (loading)
                const SliverToBoxAdapter(child: AppSkeletonRows(count: 4))
              else if (query.isNotEmpty && sections.every((s) => s.$2.isEmpty))
                SliverToBoxAdapter(
                  child: AppStateMessage(
                    icon: LucideIcons.searchX,
                    title: l10n.commonNoSearchResults,
                    message: l10n.workspacePickerNoResultsMessage,
                  ),
                )
              else
                for (final (title, workspaces, visible) in sections)
                  if (workspaces.isNotEmpty) ...[
                    SliverToBoxAdapter(child: AppSectionHeader(title: title)),
                    SliverList.builder(
                      itemCount: workspaces.length,
                      itemBuilder: (context, index) {
                        final workspace = workspaces[index];
                        return Padding(
                          padding: const EdgeInsets.symmetric(
                            vertical: AppSpacing.md,
                          ),
                          child: AppToggleRow(
                            key: ValueKey('workspace-visible-${workspace.id}'),
                            title: Text(
                              displayWorkspacePickerName(context, workspace),
                            ),
                            leading: WorkspaceAvatar(
                              workspace: workspace,
                              radius: 20,
                            ),
                            value: visible,
                            onChanged:
                                cubit.hasAuthenticatedActor &&
                                    state.visibilityResolved &&
                                    !state.pendingVisibilityIds.contains(
                                      workspace.id,
                                    )
                                ? (value) => unawaited(
                                    _setVisible(
                                      cubit,
                                      workspace.id,
                                      visible: value,
                                    ),
                                  )
                                : null,
                          ),
                        );
                      },
                    ),
                  ] else if (query.isEmpty)
                    SliverToBoxAdapter(
                      child: AppStateMessage.inline(
                        icon: visible ? LucideIcons.layers : LucideIcons.eyeOff,
                        title: visible
                            ? state.hiddenWorkspaces.isEmpty
                                  ? l10n.workspaceSelectEmpty
                                  : l10n.workspaceAllHidden
                            : l10n.workspaceHiddenEmpty,
                      ),
                    ),
            ],
          );
        },
      );
}
