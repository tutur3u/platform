import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/create_workspace_dialog.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_slivers.dart';
import 'package:mobile/features/workspace/widgets/workspace_visibility_sheet.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

enum WorkspacePickerMode { current, defaultWorkspace }

/// Opens the workspace picker and completes when it closes.
///
/// [mode] picks what a selection changes: the current workspace (switch) or
/// the default one opened at launch. [hiddenOnly] lists hidden workspaces
/// with restore actions instead. Inside the shell the sheet sits under the
/// shell chrome, so the dock's search action and Back drive it.
Future<void> showWorkspacePicker(
  BuildContext context, {
  WorkspacePickerMode mode = WorkspacePickerMode.current,
  bool hiddenOnly = false,
}) {
  final cubit = context.read<WorkspaceCubit>();
  unawaited(cubit.refreshHiddenWorkspaces());
  return showAppSheet<void>(
    context: context,
    size: AppSheetSize.large,
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
  final _search = TextEditingController();

  @override
  void dispose() {
    // The shell search field may still hold the controller this frame.
    final search = _search;
    WidgetsBinding.instance.addPostFrameCallback((_) => search.dispose());
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

  void _clearSearch() {
    _search.clear();
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

  Future<void> _setHidden(Workspace workspace, {required bool hidden}) async {
    try {
      await context.read<WorkspaceCubit>().setWorkspaceHidden(
        workspace.id,
        hidden: hidden,
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
        workspace.id,
        workspace.tier,
      ].whereType<String>().any((value) => value.toLowerCase().contains(query));

  @override
  Widget build(BuildContext context) =>
      BlocBuilder<WorkspaceCubit, WorkspaceState>(
        builder: (context, state) {
          final l10n = context.l10n;
          final cubit = context.read<WorkspaceCubit>();
          final query = _search.text.trim().toLowerCase();
          final hiddenOnly = widget.hiddenOnly;
          final choices = hiddenOnly
              ? state.hiddenWorkspaces
              : state.visibleWorkspaces;
          final results = choices.where((w) => _matches(w, query)).toList();
          final selected = widget.mode == WorkspacePickerMode.defaultWorkspace
              ? state.defaultWorkspace
              : state.currentWorkspace;
          final needsVisibility = cubit.hasAuthenticatedActor;
          final canCreate = state.limits?.canCreate ?? true;
          final data = WorkspacePickerData(
            state: state,
            mode: widget.mode,
            hiddenOnly: hiddenOnly,
            query: query,
            results: results,
            // Pin the selection above the results until the user searches.
            pinned: !hiddenOnly && query.isEmpty
                ? choices.where((w) => w.id == selected?.id).firstOrNull
                : null,
            selectedId: selected?.id,
            loading:
                needsVisibility &&
                !state.visibilityResolved &&
                state.visibilityStatus == WorkspaceStatus.loading,
            canManageVisibility:
                hiddenOnly && needsVisibility && state.visibilityResolved,
          );
          return AppSheetScaffold(
            title: hiddenOnly
                ? l10n.workspaceHiddenTitle
                : widget.mode == WorkspacePickerMode.defaultWorkspace
                ? l10n.workspaceDefaultPickerTitle
                : l10n.workspacePickerTitle,
            description: hiddenOnly
                ? l10n.workspaceHiddenDescription
                : widget.mode == WorkspacePickerMode.defaultWorkspace
                ? l10n.workspacePickerDefaultDescription
                : null,
            search: AppSheetSearch(
              controller: _search,
              hint: l10n.workspacePickerSearchHint,
              onChanged: (_) => setState(() {}),
            ),
            actions: [
              if (!hiddenOnly)
                AppButton.outline(
                  key: const ValueKey('workspace-picker-create'),
                  leading: const Icon(LucideIcons.plus, size: 16),
                  onPressed: canCreate ? _create : null,
                  child: Text(l10n.workspaceCreateSubmit),
                ),
            ],
            slivers: [
              if (!hiddenOnly && widget.mode == WorkspacePickerMode.current)
                SliverToBoxAdapter(
                  child: AppButton.outline(
                    key: const ValueKey('workspace-picker-manage'),
                    leading: const Icon(LucideIcons.eye, size: 16),
                    onPressed: _manage,
                    child: Text(l10n.workspaceManageTitle),
                  ),
                ),
              ...buildWorkspacePickerSlivers(
                context,
                data,
                WorkspacePickerCallbacks(
                  onSelect: _select,
                  onSetHidden: _setHidden,
                  onRetryVisibility: cubit.refreshHiddenWorkspaces,
                  onClearSearch: _clearSearch,
                  onCreate: canCreate && !hiddenOnly ? _create : null,
                ),
              ),
            ],
          );
        },
      );
}
