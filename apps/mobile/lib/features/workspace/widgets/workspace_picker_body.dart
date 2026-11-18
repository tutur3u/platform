import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_row.dart';
import 'package:mobile/features/workspace/widgets/workspace_result_tile.dart';
import 'package:mobile/l10n/l10n.dart';

/// Key of the picker's filter field.
const workspacePickerFilterKey = ValueKey<String>('workspace-picker-filter');

/// Key of a workspace row in the picker.
ValueKey<String> workspacePickerRowKey(String id) =>
    ValueKey<String>('workspace-result-$id');

/// Resolved view model of one picker frame.
class WorkspacePickerBodyData {
  const WorkspacePickerBodyData({
    required this.state,
    required this.rows,
    required this.selectedId,
    required this.hiddenOnly,
    required this.filter,
    required this.query,
    required this.loading,
    required this.canRestore,
  });

  final WorkspaceState state;

  /// Workspaces to list, in display order.
  final List<Workspace> rows;
  final String? selectedId;
  final bool hiddenOnly;

  /// The filter field's controller; null when the filter is not shown.
  final TextEditingController? filter;

  /// Lower-cased, trimmed filter text.
  final String query;
  final bool loading;
  final bool canRestore;
}

class WorkspacePickerBodyActions {
  const WorkspacePickerBodyActions({
    required this.onSelect,
    required this.onRestore,
    required this.onRetryVisibility,
    required this.onFilterChanged,
    required this.onClearFilter,
    required this.onCreate,
    required this.showCreate,
    required this.onManage,
  });

  final Future<void> Function(Workspace) onSelect;
  final Future<void> Function(Workspace) onRestore;
  final Future<void> Function() onRetryVisibility;
  final VoidCallback onFilterChanged;
  final VoidCallback onClearFilter;

  /// Opens the create flow; null disables the Create row.
  final Future<void> Function()? onCreate;
  final bool showCreate;

  /// Opens workspace management; null hides the Manage row.
  final Future<void> Function()? onManage;
}

const _gap = SliverToBoxAdapter(child: SizedBox(height: AppSpacing.md));

/// Picker content: a visibility warning, the filter, one list of rows, then
/// the Create and Manage rows. Rows build lazily.
List<Widget> buildWorkspacePickerBody(
  BuildContext context,
  WorkspacePickerBodyData data,
  WorkspacePickerBodyActions actions,
) {
  final l10n = context.l10n;
  final state = data.state;
  final slivers = <Widget>[
    if (state.visibilityError != null) ...[
      SliverToBoxAdapter(
        child: AppGroupedCard(
          children: [
            AppStateMessage.inline(
              icon: AppIcons.warning,
              tone: AppTone.warning,
              title: state.visibilityStatus == WorkspaceStatus.loaded
                  ? l10n.workspaceHiddenUpdateError
                  : l10n.workspaceHiddenLoadError,
              actionLabel: l10n.commonRetry,
              onAction: actions.onRetryVisibility,
            ),
          ],
        ),
      ),
      _gap,
    ],
    if (data.filter case final filter?) ...[
      SliverToBoxAdapter(
        child: AppSearchField(
          key: workspacePickerFilterKey,
          controller: filter,
          placeholder: l10n.workspacePickerSearchHint,
          onChanged: (_) => actions.onFilterChanged(),
          onClear: actions.onClearFilter,
        ),
      ),
      _gap,
    ],
  ];

  if (data.loading) {
    return [
      ...slivers,
      SliverToBoxAdapter(
        child: Semantics(
          label: l10n.commonLoading,
          child: const AppGroupedCard(children: [AppSkeletonRows(count: 4)]),
        ),
      ),
    ];
  }

  final rows = data.rows;
  if (rows.isEmpty) {
    slivers.add(SliverToBoxAdapter(child: _emptyState(context, data, actions)));
  } else {
    slivers.add(
      SliverList.builder(
        itemCount: rows.length,
        itemBuilder: (context, index) => AppGroupedSlice(
          position: AppSlicePosition.of(index, rows.length),
          dividerInset: AppSpacing.md + 32 + AppSpacing.md,
          child: _row(context, data, actions, rows[index]),
        ),
      ),
    );
  }

  final tail = [
    if (actions.showCreate)
      AppOptionTile(
        key: const ValueKey('workspace-picker-create'),
        title: l10n.workspaceCreateSubmit,
        subtitle: actions.onCreate == null
            ? l10n.workspaceCreateLimitReached
            : null,
        leading: const Icon(LucideIcons.plus),
        onTap: actions.onCreate == null
            ? null
            : () => unawaited(actions.onCreate!()),
      ),
    if (actions.onManage case final manage?)
      AppOptionTile(
        key: const ValueKey('workspace-picker-manage'),
        title: l10n.workspaceManageTitle,
        leading: const Icon(LucideIcons.settings),
        onTap: () => unawaited(manage()),
      ),
  ];
  if (tail.isNotEmpty) {
    slivers
      ..add(_gap)
      ..add(
        SliverList.builder(
          itemCount: tail.length,
          itemBuilder: (_, index) => AppGroupedSlice(
            position: AppSlicePosition.of(index, tail.length),
            dividerInset: AppSpacing.md,
            child: tail[index],
          ),
        ),
      );
  }
  return slivers;
}

Widget _row(
  BuildContext context,
  WorkspacePickerBodyData data,
  WorkspacePickerBodyActions actions,
  Workspace workspace,
) {
  if (!data.hiddenOnly) {
    return WorkspacePickerRow(
      key: workspacePickerRowKey(workspace.id),
      workspace: workspace,
      selected: workspace.id == data.selectedId,
      onTap: () => unawaited(actions.onSelect(workspace)),
    );
  }
  final state = data.state;
  return WorkspaceResultTile(
    key: workspacePickerRowKey(workspace.id),
    workspace: workspace,
    selected: false,
    current: workspace.id == state.currentWorkspace?.id,
    isDefault: workspace.id == state.defaultWorkspace?.id,
    pending: state.pendingVisibilityIds.contains(workspace.id),
    onSelect: null,
    actionLabel: context.l10n.workspaceRestoreAction,
    onVisibility: data.canRestore
        ? () => unawaited(actions.onRestore(workspace))
        : null,
  );
}

Widget _emptyState(
  BuildContext context,
  WorkspacePickerBodyData data,
  WorkspacePickerBodyActions actions,
) {
  final l10n = context.l10n;
  if (data.query.isNotEmpty) {
    return AppStateMessage(
      key: const ValueKey('workspace-picker-no-results'),
      icon: LucideIcons.searchX,
      title: l10n.commonNoSearchResults,
      message: l10n.workspacePickerNoResultsMessage,
      actionLabel: l10n.commonClearSearch,
      onAction: actions.onClearFilter,
    );
  }
  if (data.hiddenOnly) {
    return AppStateMessage(
      icon: LucideIcons.eyeOff,
      title: l10n.workspaceHiddenEmpty,
    );
  }
  if (data.state.workspaces.any((workspace) => !workspace.deleted)) {
    return AppStateMessage(
      icon: LucideIcons.eyeOff,
      title: l10n.workspaceAllHidden,
    );
  }
  return AppStateMessage(
    key: const ValueKey('workspace-picker-empty'),
    icon: LucideIcons.layoutGrid,
    tone: AppTone.primary,
    title: l10n.workspaceSelectEmpty,
    message: l10n.workspacePickerEmptyMessage,
  );
}
