import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/workspace.dart';
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
      final visibilityUnknown =
          needsVisibility &&
          state.visibilityStatus != WorkspaceStatus.loaded &&
          !state.visibilityResolved &&
          state.visibilityStatus != WorkspaceStatus.initial;
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
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
                  child: Row(
                    children: [
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
                      Image.asset(
                        'assets/logos/transparent.png',
                        width: 36,
                        height: 36,
                        semanticLabel: 'Tuturuuu',
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          _hiddenOnly
                              ? l10n.workspaceHiddenTitle
                              : l10n.workspacePickerTitle,
                          style: theme.typography.h3,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      IconButton(
                        tooltip: l10n.workspacePickerClose,
                        icon: const Icon(Icons.close_rounded),
                        onPressed: () => Navigator.maybePop(context),
                      ),
                    ],
                  ),
                ),
                if (_hiddenOnly ||
                    widget.mode == WorkspacePickerMode.defaultWorkspace ||
                    _searchVisible ||
                    visibleError ||
                    (!_hiddenOnly && (state.limits?.limit ?? 0) > 0))
                  Flexible(
                    child: SingleChildScrollView(
                      child: Column(
                        children: [
                          if (!_hiddenOnly && (state.limits?.limit ?? 0) > 0)
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                              ),
                              child: Column(
                                children: [
                                  Text(
                                    l10n.workspaceCreateLimitInfo(
                                      state.limits!.currentCount,
                                      state.limits!.limit,
                                    ),
                                  ),
                                  if (!canCreate)
                                    Text(l10n.workspaceCreateLimitReached),
                                ],
                              ),
                            ),
                          if (_hiddenOnly ||
                              widget.mode ==
                                  WorkspacePickerMode.defaultWorkspace)
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                              ),
                              child: Text(
                                _hiddenOnly
                                    ? l10n.workspaceHiddenDescription
                                    : l10n.workspaceDefaultPickerTitle,
                              ),
                            ),
                          if (_searchVisible)
                            Padding(
                              padding: const EdgeInsets.all(16),
                              child: TextField(
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
                            ),
                          if (visibleError)
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                              ),
                              child: Row(
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
                            ),
                        ],
                      ),
                    ),
                  ),
                Expanded(
                  child: loading
                      ? Semantics(
                          label: l10n.commonLoading,
                          child: ListView(
                            padding: const EdgeInsets.all(16),
                            children: [
                              const LinearProgressIndicator(),
                              for (var i = 0; i < 3; i++)
                                const Card(child: SizedBox(height: 80)),
                            ],
                          ),
                        )
                      : visibilityUnknown
                      ? visibleError
                            ? const SizedBox.expand()
                            : Center(
                                child: Text(
                                  state.visibilityStatus ==
                                          WorkspaceStatus.loaded
                                      ? l10n.workspaceHiddenUpdateError
                                      : l10n.workspaceHiddenLoadError,
                                ),
                              )
                      : ListView(
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 112),
                          children: [
                            for (final section in [
                              (
                                l10n.workspacePersonalSection,
                                sections.personal,
                              ),
                              (l10n.workspaceSystemSection, sections.system),
                              (l10n.workspacePickerTitle, sections.team),
                            ])
                              if (section.$2.isNotEmpty) ...[
                                Padding(
                                  padding: const EdgeInsets.only(
                                    bottom: 8,
                                    top: 8,
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
                                    onVisibility: needsVisibility
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
                        ),
                ),
              ],
            ),
          ),
          floatingActionButton: SafeArea(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                FloatingActionButton(
                  heroTag: null,
                  tooltip: l10n.workspacePickerSearchHint,
                  onPressed: _openSearch,
                  child: const Icon(Icons.search_rounded),
                ),
                if (!_hiddenOnly) ...[
                  const SizedBox(width: 12),
                  FloatingActionButton(
                    heroTag: null,
                    tooltip: l10n.workspaceCreateNew,
                    onPressed: canCreate ? _create : null,
                    child: const Icon(Icons.add_rounded),
                  ),
                ],
              ],
            ),
          ),
        ),
      );
    },
  );
}
