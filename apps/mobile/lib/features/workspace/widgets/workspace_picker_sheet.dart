import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/shell_brand_title.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/create_workspace_dialog.dart';
import 'package:mobile/features/workspace/widgets/workspace_result_tile.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

enum WorkspacePickerMode { current, defaultWorkspace }

void showWorkspacePickerSheet(
  BuildContext parentContext, {
  WorkspacePickerMode mode = WorkspacePickerMode.current,
  bool hiddenOnly = false,
}) {
  final cubit = parentContext.read<WorkspaceCubit>();
  unawaited(cubit.refreshHiddenWorkspaces());
  unawaited(
    showDialog<void>(
      context: parentContext,
      useSafeArea: false,
      builder: (_) => Dialog.fullscreen(
        child: BlocProvider.value(
          value: cubit,
          child: _WorkspacePicker(
            parentContext: parentContext,
            mode: mode,
            hiddenOnly: hiddenOnly,
          ),
        ),
      ),
    ),
  );
}

class _WorkspacePicker extends StatefulWidget {
  const _WorkspacePicker({
    required this.parentContext,
    required this.mode,
    required this.hiddenOnly,
  });
  final BuildContext parentContext;
  final WorkspacePickerMode mode;
  final bool hiddenOnly;
  @override
  State<_WorkspacePicker> createState() => _WorkspacePickerState();
}

class _WorkspacePickerState extends State<_WorkspacePicker> {
  final _search = TextEditingController();
  final _focus = FocusNode();
  bool _searchVisible = false;
  late bool _hiddenOnly;

  @override
  void initState() {
    super.initState();
    _hiddenOnly = widget.hiddenOnly;
    _search.addListener(() => setState(() {}));
    _focus.addListener(() {
      if (mounted && !_focus.hasFocus && _search.text.trim().isEmpty) {
        setState(() => _searchVisible = false);
      }
    });
  }

  @override
  void dispose() {
    _search.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _clearSearch() {
    _search.clear();
    _focus.unfocus();
    setState(() => _searchVisible = false);
  }

  void _openSearch() {
    setState(() => _searchVisible = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  Future<void> _select(Workspace workspace) async {
    final cubit = context.read<WorkspaceCubit>();
    await Navigator.maybePop(context);
    if (widget.mode == WorkspacePickerMode.defaultWorkspace) {
      await cubit.setDefaultWorkspace(workspace);
    } else {
      await cubit.selectWorkspace(workspace);
    }
  }

  Future<void> _create() async {
    await Navigator.maybePop(context);
    if (!widget.parentContext.mounted) return;
    await showCreateWorkspaceDialog(widget.parentContext);
  }

  Future<void> _setHidden(Workspace workspace, bool hidden) async {
    try {
      await context.read<WorkspaceCubit>().setWorkspaceHidden(
        workspace.id,
        hidden: hidden,
      );
    } on Object {
      // The cubit rolls back and exposes a localized retry state below.
    }
  }

  @override
  Widget build(
    BuildContext context,
  ) => BlocBuilder<WorkspaceCubit, WorkspaceState>(
    builder: (context, state) {
      final l10n = context.l10n;
      final theme = shad.Theme.of(context);
      final query = _search.text.trim().toLowerCase();
      final choices = _hiddenOnly
          ? state.hiddenWorkspaces
          : state.visibleWorkspaces;
      final results = choices.where(
        (workspace) =>
            query.isEmpty ||
            [
              displayWorkspacePickerName(context, workspace),
              workspace.name,
              workspace.id,
              workspace.tier,
            ].whereType<String>().any(
              (value) => value.toLowerCase().contains(query),
            ),
      );
      final sections = splitWorkspaceSections(results);
      final selectedId =
          (widget.mode == WorkspacePickerMode.defaultWorkspace
                  ? state.defaultWorkspace
                  : state.currentWorkspace)
              ?.id;
      final needsVisibility = context
          .read<WorkspaceCubit>()
          .hasAuthenticatedActor;
      final loading =
          needsVisibility &&
          !state.visibilityResolved &&
          state.visibilityStatus == WorkspaceStatus.loading;
      final visibleError = state.visibilityError != null;
      final canCreate = state.limits?.canCreate ?? true;
      return BackButtonListener(
        onBackButtonPressed: () async {
          if (_hiddenOnly && !widget.hiddenOnly) {
            _clearSearch();
            setState(() => _hiddenOnly = false);
          } else {
            await Navigator.maybePop(context);
          }
          return true;
        },
        child: Scaffold(
          backgroundColor: theme.colorScheme.background,
          body: SafeArea(
            bottom: false,
            child: Stack(
              children: [
                Column(
                  children: [
                    shad.AppBar(
                      height: mobileSectionAppBarHeightFor(context),
                      padding: mobileSectionAppBarPadding,
                      backgroundColor: Colors.transparent,
                      leading: [
                        if (_hiddenOnly && !widget.hiddenOnly)
                          IconButton(
                            tooltip: MaterialLocalizations.of(
                              context,
                            ).backButtonTooltip,
                            icon: const Icon(Icons.arrow_back_rounded),
                            onPressed: () {
                              _clearSearch();
                              setState(() => _hiddenOnly = false);
                            },
                          ),
                      ],
                      trailingGap: 6,
                      trailing: [
                        IconButton(
                          tooltip: l10n.workspacePickerClose,
                          icon: const Icon(Icons.close_rounded),
                          onPressed: () => Navigator.maybePop(context),
                        ),
                      ],
                      child: ShellBrandTitle(
                        title: _hiddenOnly
                            ? l10n.workspaceHiddenTitle
                            : l10n.workspacePickerTitle,
                      ),
                    ),
                    Expanded(
                      child: ListView(
                        key: const ValueKey('workspace-picker-scroll'),
                        keyboardDismissBehavior:
                            ScrollViewKeyboardDismissBehavior.onDrag,
                        padding: EdgeInsets.fromLTRB(
                          16,
                          12,
                          16,
                          88 + MediaQuery.paddingOf(context).bottom,
                        ),
                        children: [
                          if (!_hiddenOnly &&
                              (state.limits?.limit ?? 0) > 0) ...[
                            Text(
                              l10n.workspaceCreateLimitInfo(
                                state.limits!.currentCount,
                                state.limits!.limit,
                              ),
                            ),
                            if (!canCreate)
                              Text(l10n.workspaceCreateLimitReached),
                            const SizedBox(height: 12),
                          ],
                          if (_hiddenOnly ||
                              widget.mode ==
                                  WorkspacePickerMode.defaultWorkspace) ...[
                            Text(
                              _hiddenOnly
                                  ? l10n.workspaceHiddenDescription
                                  : l10n.workspaceDefaultPickerTitle,
                            ),
                            const SizedBox(height: 12),
                          ],
                          if (_searchVisible) ...[
                            TextField(
                              controller: _search,
                              focusNode: _focus,
                              decoration: InputDecoration(
                                hintText: l10n.workspacePickerSearchHint,
                                prefixIcon: const Icon(Icons.search_rounded),
                                suffixIcon: query.isEmpty
                                    ? null
                                    : IconButton(
                                        tooltip: l10n.commonClearSearch,
                                        onPressed: _clearSearch,
                                        icon: const Icon(Icons.close_rounded),
                                      ),
                              ),
                            ),
                            const SizedBox(height: 12),
                          ],
                          if (visibleError) ...[
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Text(
                                    state.visibilityStatus ==
                                            WorkspaceStatus.loaded
                                        ? l10n.workspaceHiddenUpdateError
                                        : l10n.workspaceHiddenLoadError,
                                  ),
                                ),
                                TextButton(
                                  onPressed: () => context
                                      .read<WorkspaceCubit>()
                                      .refreshHiddenWorkspaces(),
                                  child: Text(l10n.commonRetry),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                          ],
                          if (loading) ...[
                            Semantics(
                              label: l10n.commonLoading,
                              child: const LinearProgressIndicator(),
                            ),
                            for (var i = 0; i < 3; i++)
                              const Card(child: SizedBox(height: 80)),
                          ] else ...[
                            for (final section in [
                              (
                                l10n.workspacePersonalSection,
                                sections.personal,
                              ),
                              (l10n.workspaceSystemSection, sections.system),
                              (l10n.workspaceTeamSection, sections.team),
                            ])
                              if (section.$2.isNotEmpty) ...[
                                Padding(
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 8,
                                  ),
                                  child: Text(
                                    section.$1,
                                    style: theme.typography.small,
                                  ),
                                ),
                                for (final workspace in section.$2)
                                  WorkspaceResultTile(
                                    key: ValueKey(
                                      'workspace-result-${workspace.id}',
                                    ),
                                    workspace: workspace,
                                    selected: workspace.id == selectedId,
                                    current:
                                        workspace.id ==
                                        state.currentWorkspace?.id,
                                    isDefault:
                                        workspace.id ==
                                        state.defaultWorkspace?.id,
                                    pending: state.pendingVisibilityIds
                                        .contains(workspace.id),
                                    onSelect: _hiddenOnly
                                        ? null
                                        : () => _select(workspace),
                                    actionLabel: _hiddenOnly
                                        ? l10n.workspaceRestoreAction
                                        : l10n.workspaceHideAction,
                                    onVisibility:
                                        needsVisibility &&
                                            state.visibilityResolved
                                        ? () => _setHidden(
                                            workspace,
                                            !_hiddenOnly,
                                          )
                                        : null,
                                  ),
                              ],
                            if (results.isEmpty)
                              Center(
                                child: Column(
                                  children: [
                                    Text(
                                      query.isNotEmpty
                                          ? l10n.commonNoSearchResults
                                          : _hiddenOnly
                                          ? l10n.workspaceHiddenEmpty
                                          : state.workspaces.isNotEmpty
                                          ? l10n.workspaceAllHidden
                                          : l10n.workspaceSelectEmpty,
                                    ),
                                    if (query.isNotEmpty)
                                      TextButton(
                                        onPressed: _clearSearch,
                                        child: Text(l10n.commonClearSearch),
                                      ),
                                    if (!_hiddenOnly &&
                                        state.hiddenWorkspaces.isNotEmpty)
                                      TextButton(
                                        onPressed: () {
                                          _clearSearch();
                                          setState(() => _hiddenOnly = true);
                                        },
                                        child: Text(l10n.workspaceHiddenTitle),
                                      ),
                                  ],
                                ),
                              ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
                Positioned(
                  right: 16,
                  left: 16,
                  bottom: 16,
                  child: SafeArea(
                    top: false,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        ShellDockActionButton(
                          action: ShellActionSpec(
                            id: 'workspace-picker-search',
                            icon: Icons.search_rounded,
                            tooltip: l10n.workspacePickerSearchHint,
                            onPressed: _openSearch,
                          ),
                        ),
                        if (!_hiddenOnly) ...[
                          const SizedBox(width: 12),
                          ShellDockActionButton(
                            primary: false,
                            action: ShellActionSpec(
                              id: 'workspace-picker-create',
                              icon: Icons.add_rounded,
                              tooltip: l10n.workspaceCreateNew,
                              enabled: canCreate,
                              onPressed: _create,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}
