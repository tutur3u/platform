import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/models/workspace_limits.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_current_card.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/features/workspace/widgets/workspace_result_tile.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

/// Resolved view model of one picker frame.
class WorkspacePickerData {
  const WorkspacePickerData({
    required this.state,
    required this.mode,
    required this.hiddenOnly,
    required this.query,
    required this.results,
    required this.pinned,
    required this.selectedId,
    required this.loading,
    required this.canManageVisibility,
  });

  final WorkspaceState state;
  final WorkspacePickerMode mode;
  final bool hiddenOnly;

  /// Lower-cased, trimmed search query.
  final String query;
  final List<Workspace> results;

  /// The selection shown in the card above the results, if any.
  final Workspace? pinned;
  final String? selectedId;
  final bool loading;
  final bool canManageVisibility;
}

class WorkspacePickerCallbacks {
  const WorkspacePickerCallbacks({
    required this.onSelect,
    required this.onSetHidden,
    required this.onRetryVisibility,
    required this.onClearSearch,
    required this.onCreate,
  });

  final Future<void> Function(Workspace) onSelect;
  final Future<void> Function(Workspace, {required bool hidden}) onSetHidden;
  final Future<void> Function() onRetryVisibility;
  final VoidCallback onClearSearch;

  /// Opens the create flow; `null` when creation is unavailable.
  final Future<void> Function()? onCreate;
}

Widget _gap(Widget child, {double bottom = AppLayout.sectionGap}) =>
    SliverToBoxAdapter(
      child: Padding(
        padding: EdgeInsets.only(bottom: bottom),
        child: child,
      ),
    );

/// Lazy picker content: notices, the pinned selection, then Personal,
/// Internal and Team sections built row by row, so long lists stay smooth.
List<Widget> buildWorkspacePickerSlivers(
  BuildContext context,
  WorkspacePickerData data,
  WorkspacePickerCallbacks callbacks,
) {
  final l10n = context.l10n;
  final state = data.state;
  final limits = state.limits;
  final slivers = <Widget>[
    if (!data.hiddenOnly && limits != null && limits.limit > 0)
      _gap(_WorkspaceLimitNotice(limits: limits)),
    if (state.visibilityError != null)
      _gap(
        AppGroupedCard(
          children: [
            AppStateMessage.inline(
              icon: AppIcons.warning,
              tone: AppTone.warning,
              title: state.visibilityStatus == WorkspaceStatus.loaded
                  ? l10n.workspaceHiddenUpdateError
                  : l10n.workspaceHiddenLoadError,
              actionLabel: l10n.commonRetry,
              onAction: callbacks.onRetryVisibility,
            ),
          ],
        ),
      ),
  ];

  if (data.loading) {
    return [
      ...slivers,
      SliverToBoxAdapter(
        child: Semantics(
          label: l10n.commonLoading,
          child: const AppGroupedCard(
            children: [AppSkeletonRows(count: 5, leadingSize: 40)],
          ),
        ),
      ),
    ];
  }

  final pinned = data.pinned;
  if (pinned != null) {
    final defaultMode = data.mode == WorkspacePickerMode.defaultWorkspace;
    slivers.add(
      _gap(
        WorkspaceCurrentCard(
          key: ValueKey('workspace-current-${pinned.id}'),
          workspace: pinned,
          label: defaultMode
              ? l10n.workspaceDefaultPickerTitle
              : l10n.workspacePickerCurrentLabel,
          isDefault: !defaultMode && pinned.id == state.defaultWorkspace?.id,
          onTap: () => unawaited(callbacks.onSelect(pinned)),
        ),
      ),
    );
  }

  final sections = splitWorkspaceSections(
    pinned == null
        ? data.results
        : data.results.where((workspace) => workspace.id != pinned.id),
  );
  for (final (title, icon, workspaces) in [
    (l10n.workspacePersonalSection, LucideIcons.user, sections.personal),
    (l10n.workspaceSystemSection, LucideIcons.building2, sections.system),
    (l10n.workspaceTeamSection, LucideIcons.users, sections.team),
  ]) {
    if (workspaces.isEmpty) continue;
    slivers
      ..add(
        SliverToBoxAdapter(
          child: AppSectionHeader(title: title, icon: icon),
        ),
      )
      ..add(
        SliverList.builder(
          itemCount: workspaces.length,
          itemBuilder: (context, index) => AppGroupedSlice(
            position: AppSlicePosition.of(index, workspaces.length),
            dividerInset: AppLayout.rowHorizontalPadding + 40 + 12,
            child: _tile(context, data, callbacks, workspaces[index]),
          ),
        ),
      )
      ..add(const SliverToBoxAdapter(child: SizedBox(height: 20)));
  }

  if (data.results.isEmpty) {
    slivers.add(
      SliverToBoxAdapter(child: _emptyState(context, data, callbacks)),
    );
  }
  return slivers;
}

Widget _tile(
  BuildContext context,
  WorkspacePickerData data,
  WorkspacePickerCallbacks callbacks,
  Workspace workspace,
) {
  final l10n = context.l10n;
  final state = data.state;
  return WorkspaceResultTile(
    key: ValueKey('workspace-result-${workspace.id}'),
    workspace: workspace,
    selected: workspace.id == data.selectedId,
    current: workspace.id == state.currentWorkspace?.id,
    isDefault: workspace.id == state.defaultWorkspace?.id,
    pending: state.pendingVisibilityIds.contains(workspace.id),
    onSelect: data.hiddenOnly
        ? null
        : () => unawaited(callbacks.onSelect(workspace)),
    actionLabel: data.hiddenOnly
        ? l10n.workspaceRestoreAction
        : l10n.workspaceHideAction,
    onVisibility: data.canManageVisibility
        ? () => unawaited(
            callbacks.onSetHidden(workspace, hidden: !data.hiddenOnly),
          )
        : null,
  );
}

Widget _emptyState(
  BuildContext context,
  WorkspacePickerData data,
  WorkspacePickerCallbacks callbacks,
) {
  final l10n = context.l10n;
  if (data.query.isNotEmpty) {
    return AppStateMessage(
      key: const ValueKey('workspace-picker-no-results'),
      icon: LucideIcons.searchX,
      title: l10n.commonNoSearchResults,
      message: l10n.workspacePickerNoResultsMessage,
      actionLabel: l10n.commonClearSearch,
      onAction: callbacks.onClearSearch,
    );
  }
  if (data.hiddenOnly) {
    return AppStateMessage(
      icon: LucideIcons.eyeOff,
      title: l10n.workspaceHiddenEmpty,
    );
  }
  if (data.state.workspaces.isNotEmpty) {
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
    actionLabel: callbacks.onCreate == null ? null : l10n.workspaceCreateSubmit,
    onAction: callbacks.onCreate,
  );
}

class _WorkspaceLimitNotice extends StatelessWidget {
  const _WorkspaceLimitNotice({required this.limits});

  final WorkspaceLimits limits;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final reached = !limits.canCreate;
    final usage = l10n.workspaceCreateLimitInfo(
      limits.currentCount,
      limits.limit,
    );
    return AppGroupedCard(
      padding: const EdgeInsets.all(AppLayout.rowHorizontalPadding),
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              usage,
              style: tokens.typography.small.copyWith(
                color: c.foreground,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            AppMeter(
              value: limits.currentCount / limits.limit,
              tone: reached ? AppTone.warning : AppTone.primary,
              semanticLabel: usage,
            ),
            if (reached) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(
                l10n.workspaceCreateLimitReached,
                style: tokens.typography.small.copyWith(
                  color: c.mutedForeground,
                ),
              ),
            ],
          ],
        ),
      ],
    );
  }
}
