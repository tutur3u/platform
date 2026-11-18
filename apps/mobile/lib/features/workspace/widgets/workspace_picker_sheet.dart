import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/create_workspace_dialog.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_body.dart';
import 'package:mobile/features/workspace/widgets/workspace_visibility_sheet.dart';
import 'package:mobile/features/workspace/workspace_picker_order.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

enum WorkspacePickerMode { current, defaultWorkspace }

/// Opens the workspace picker and completes when it closes.
///
/// [mode] picks what a selection changes: the current workspace (switch) or
/// the default one opened at launch. [hiddenOnly] lists hidden workspaces
/// with restore actions instead. The sheet fits its rows and opens tall only
/// when the filter field shows.
Future<void> showWorkspacePicker(
  BuildContext context, {
  WorkspacePickerMode mode = WorkspacePickerMode.current,
  bool hiddenOnly = false,
}) {
  final cubit = context.read<WorkspaceCubit>();
  unawaited(cubit.refreshHiddenWorkspaces());
  final count = cubit.state.visibleWorkspaces.length;
  return showAppSheet<void>(
    context: context,
    size: count > workspacePickerFilterThreshold
        ? AppSheetSize.large
        : AppSheetSize.fit,
    builder: (_) => BlocProvider.value(
      value: cubit,
      child: WorkspacePickerSheet(
        parentContext: context,
        mode: mode,
        hiddenOnly: hiddenOnly,
      ),
    ),
  );
}

/// Fire-and-forget form of [showWorkspacePicker] for button callbacks.
void showWorkspacePickerSheet(
  BuildContext parentContext, {
  WorkspacePickerMode mode = WorkspacePickerMode.current,
  bool hiddenOnly = false,
}) => unawaited(
  showWorkspacePicker(parentContext, mode: mode, hiddenOnly: hiddenOnly),
);

/// Body of the workspace picker sheet; open it with [showWorkspacePicker].
///
/// The selected workspace is the checked first row; the rest follow by
/// recent use. Create and Manage are plain rows at the end, and a filter
/// field appears only above [workspacePickerFilterThreshold] workspaces.
class WorkspacePickerSheet extends StatefulWidget {
  const WorkspacePickerSheet({
    required this.parentContext,
    this.mode = WorkspacePickerMode.current,
    this.hiddenOnly = false,
    super.key,
  });

  /// Context that opened the sheet; follow-up flows (create) open from it.
  final BuildContext parentContext;
  final WorkspacePickerMode mode;
  final bool hiddenOnly;

  @override
  State<WorkspacePickerSheet> createState() => _WorkspacePickerSheetState();
}

class _WorkspacePickerSheetState extends State<WorkspacePickerSheet> {
  final _filter = TextEditingController();

  @override
  void dispose() {
    _filter.dispose();
    super.dispose();
  }

  Future<void> _close() async {
    final scope = AppModalScope.maybeOf(context);
    if (scope != null) {
      await scope.close();
    } else {
      await Navigator.maybePop(context);
    }
  }

  void _clearFilter() {
    _filter.clear();
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() {});
  }

  Future<void> _select(Workspace workspace) async {
    final cubit = context.read<WorkspaceCubit>();
    await _close();
    if (widget.mode == WorkspacePickerMode.defaultWorkspace) {
      await cubit.setDefaultWorkspace(workspace);
    } else {
      await cubit.selectWorkspace(workspace);
    }
  }

  Future<void> _manage() async {
    final cubit = context.read<WorkspaceCubit>();
    await _close();
    if (!widget.parentContext.mounted) return;
    await showAppSheet<void>(
      context: widget.parentContext,
      size: AppSheetSize.large,
      builder: (_) => BlocProvider.value(
        value: cubit,
        child: const WorkspaceVisibilitySheet(),
      ),
    );
  }

  Future<void> _create() async {
    await _close();
    if (!widget.parentContext.mounted) return;
    await showCreateWorkspaceDialog(widget.parentContext);
  }

  Future<void> _restore(Workspace workspace) async {
    try {
      await context.read<WorkspaceCubit>().setWorkspaceHidden(
        workspace.id,
        hidden: false,
      );
    } on Object {
      // The cubit rolls back and exposes a localized retry state.
    }
  }

  bool _matches(Workspace workspace, String query) =>
      query.isEmpty ||
      [
        displayWorkspacePickerName(context, workspace),
        workspace.name,
      ].whereType<String>().any((value) => value.toLowerCase().contains(query));

  @override
  Widget build(BuildContext context) =>
      BlocBuilder<WorkspaceCubit, WorkspaceState>(
        builder: (context, state) {
          final l10n = context.l10n;
          final cubit = context.read<WorkspaceCubit>();
          final hiddenOnly = widget.hiddenOnly;
          final defaultMode =
              widget.mode == WorkspacePickerMode.defaultWorkspace;
          final choices = hiddenOnly
              ? state.hiddenWorkspaces
              : state.visibleWorkspaces;
          final showFilter = choices.length > workspacePickerFilterThreshold;
          final query = showFilter ? _filter.text.trim().toLowerCase() : '';
          final selectedId = defaultMode
              ? state.defaultWorkspace?.id
              : state.currentWorkspace?.id;
          final rows = orderPickerWorkspaces(
            choices.where((w) => _matches(w, query)).toList(),
            selectedId: hiddenOnly ? null : selectedId,
            recentIds: hiddenOnly ? const [] : state.recentWorkspaceIds,
          );
          final needsVisibility = cubit.hasAuthenticatedActor;
          return AppSheetScaffold(
            title: hiddenOnly
                ? l10n.workspaceHiddenTitle
                : defaultMode
                ? l10n.workspaceDefaultPickerTitle
                : l10n.workspacePickerTitle,
            description: hiddenOnly
                ? l10n.workspaceHiddenDescription
                : defaultMode
                ? l10n.workspacePickerDefaultDescription
                : null,
            slivers: buildWorkspacePickerBody(
              context,
              WorkspacePickerBodyData(
                state: state,
                rows: rows,
                selectedId: selectedId,
                hiddenOnly: hiddenOnly,
                filter: showFilter ? _filter : null,
                query: query,
                loading:
                    needsVisibility &&
                    !state.visibilityResolved &&
                    state.visibilityStatus == WorkspaceStatus.loading,
                canRestore: needsVisibility && state.visibilityResolved,
              ),
              WorkspacePickerBodyActions(
                onSelect: _select,
                onRestore: _restore,
                onRetryVisibility: cubit.refreshHiddenWorkspaces,
                onFilterChanged: () => setState(() {}),
                onClearFilter: _clearFilter,
                onCreate: hiddenOnly
                    ? null
                    : (state.limits?.canCreate ?? true)
                    ? _create
                    : null,
                showCreate: !hiddenOnly,
                onManage: hiddenOnly || defaultMode ? null : _manage,
              ),
            ),
          );
        },
      );
}
