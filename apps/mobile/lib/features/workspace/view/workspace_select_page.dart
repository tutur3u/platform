import 'package:flutter/material.dart'
    hide AppBar, Chip, CircleAvatar, FilledButton, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/create_workspace_dialog.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/features/workspace/widgets/workspace_result_tile.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class WorkspaceSelectPage extends StatefulWidget {
  const WorkspaceSelectPage({super.key});

  @override
  State<WorkspaceSelectPage> createState() => _WorkspaceSelectPageState();
}

class _WorkspaceSelectPageState extends State<WorkspaceSelectPage> {
  bool _isSelecting = false;
  String? _selectingWorkspaceId;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return shad.Scaffold(
      headers: [
        shad.AppBar(
          title: Text(l10n.workspaceSelectTitle),
          trailing: [
            BlocBuilder<WorkspaceCubit, WorkspaceState>(
              builder: (context, state) {
                final canCreate = state.limits?.canCreate ?? true;
                return shad.GhostButton(
                  size: shad.ButtonSize.small,
                  onPressed: canCreate
                      ? () => showCreateWorkspaceDialog(context)
                      : null,
                  child: const Icon(Icons.add),
                );
              },
            ),
          ],
        ),
      ],
      child: BlocBuilder<WorkspaceCubit, WorkspaceState>(
        builder: (context, state) {
          if (state.status == WorkspaceStatus.loading) {
            return const AppLoadingIndicator.page();
          }

          if (state.status == WorkspaceStatus.error) {
            return _ErrorView(
              error: state.error,
              onRetry: () => context.read<WorkspaceCubit>().loadWorkspaces(
                forceRefresh: true,
              ),
            );
          }

          if (context.read<WorkspaceCubit>().hasAuthenticatedActor &&
              !state.visibilityResolved &&
              state.visibilityStatus != WorkspaceStatus.error) {
            return const AppLoadingIndicator.page();
          }
          if (state.workspaces.isNotEmpty && state.visibleWorkspaces.isEmpty) {
            return AppPageBody(
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(l10n.workspaceAllHidden, textAlign: TextAlign.center),
                    const shad.Gap(16),
                    shad.PrimaryButton(
                      onPressed: () =>
                          showWorkspacePickerSheet(context, hiddenOnly: true),
                      child: Text(l10n.workspaceHiddenTitle),
                    ),
                  ],
                ),
              ),
            );
          }
          if (state.workspaces.isEmpty) {
            return _EmptyView(
              onCreateWorkspace: () => showCreateWorkspaceDialog(context),
            );
          }

          final list = _WorkspaceListView(
            state: state,
            isSelecting: _isSelecting,
            selectingWorkspaceId: _selectingWorkspaceId,
            onRefresh: () => context.read<WorkspaceCubit>().loadWorkspaces(
              forceRefresh: true,
            ),
            onSelect: _onSelectWorkspace,
          );
          if (state.visibilityStatus != WorkspaceStatus.error) return list;
          return Column(
            children: [
              AppPageBody(
                consumeBottomClearance: false,
                child: Row(
                  children: [
                    Expanded(child: Text(l10n.workspaceHiddenLoadError)),
                    shad.GhostButton(
                      onPressed: () => context
                          .read<WorkspaceCubit>()
                          .refreshHiddenWorkspaces(),
                      child: Text(l10n.commonRetry),
                    ),
                  ],
                ),
              ),
              Expanded(child: list),
            ],
          );
        },
      ),
    );
  }

  Future<void> _onSelectWorkspace(Workspace workspace) async {
    final l10n = context.l10n;
    setState(() {
      _isSelecting = true;
      _selectingWorkspaceId = workspace.id;
    });

    try {
      await context.read<WorkspaceCubit>().selectWorkspace(workspace);
      if (!mounted) return;
    } on Exception catch (_) {
      if (!mounted) return;
      shad.showToast(
        context: context,
        builder: (context, overlay) =>
            shad.Alert.destructive(title: Text(l10n.workspaceSelectError)),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isSelecting = false;
          _selectingWorkspaceId = null;
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Workspace list with sections and pull-to-refresh
// ---------------------------------------------------------------------------

class _WorkspaceListView extends StatelessWidget {
  const _WorkspaceListView({
    required this.state,
    required this.isSelecting,
    required this.selectingWorkspaceId,
    required this.onRefresh,
    required this.onSelect,
  });

  final WorkspaceState state;
  final bool isSelecting;
  final String? selectingWorkspaceId;
  final Future<void> Function() onRefresh;
  final ValueChanged<Workspace> onSelect;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final sections = splitWorkspaceSections(state.visibleWorkspaces);
    // Flattened so the list builds rows lazily, however many there are.
    final items = <WidgetBuilder>[
      if (state.limits != null && state.limits!.limit > 0) ...[
        (_) => _LimitsBar(
          currentCount: state.limits!.currentCount,
          limit: state.limits!.limit,
        ),
        (_) => const shad.Gap(16),
      ],
      for (final (title, icon, workspaces) in [
        (l10n.workspacePersonalSection, LucideIcons.user, sections.personal),
        (l10n.workspaceSystemSection, LucideIcons.building2, sections.system),
        (l10n.workspaceTeamSection, LucideIcons.users, sections.team),
      ])
        if (workspaces.isNotEmpty) ...[
          (_) => AppSectionHeader(
            title: title,
            icon: icon,
            count: workspaces.length,
          ),
          for (final (index, workspace) in workspaces.indexed)
            (_) => AppGroupedSlice(
              position: AppSlicePosition.of(index, workspaces.length),
              dividerInset: AppLayout.rowHorizontalPadding + 40 + 12,
              child: _buildTile(workspace),
            ),
          (_) => const shad.Gap(20),
        ],
    ];

    return NovaRefreshIndicator(
      onRefresh: onRefresh,
      child: AppPageListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: items.length,
        itemBuilder: (context, index) => items[index](context),
      ),
    );
  }

  Widget _buildTile(Workspace workspace) => WorkspaceResultTile(
    key: ValueKey('workspace-select-${workspace.id}'),
    workspace: workspace,
    selected: workspace.id == state.currentWorkspace?.id,
    current: workspace.id == state.currentWorkspace?.id,
    isDefault: workspace.id == state.defaultWorkspace?.id,
    pending: false,
    loading: isSelecting && selectingWorkspaceId == workspace.id,
    onSelect: isSelecting ? null : () => onSelect(workspace),
    onVisibility: null,
    actionLabel: '',
  );
}

// ---------------------------------------------------------------------------
// Limits progress bar
// ---------------------------------------------------------------------------

class _LimitsBar extends StatelessWidget {
  const _LimitsBar({required this.currentCount, required this.limit});

  final int currentCount;
  final int limit;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final isNearLimit = currentCount >= limit - 1;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        color: isNearLimit
            ? theme.colorScheme.destructive.withValues(alpha: 0.08)
            : theme.colorScheme.muted,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                child: Text(
                  l10n.workspaceCreateLimitInfo(currentCount, limit),
                  style: theme.typography.small.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ),
              Text(
                '$currentCount / $limit',
                style: theme.typography.small.copyWith(
                  fontWeight: FontWeight.w600,
                  color: isNearLimit
                      ? theme.colorScheme.destructive
                      : theme.colorScheme.mutedForeground,
                ),
              ),
            ],
          ),
          const shad.Gap(8),
          shad.LinearProgressIndicator(value: currentCount / limit),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, required this.onRetry});

  final String? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return AppPageBody(
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.cloud_off_rounded,
              size: 48,
              color: theme.colorScheme.mutedForeground,
            ),
            const shad.Gap(16),
            Text(
              error ?? l10n.workspaceSelectEmpty,
              textAlign: TextAlign.center,
              style: theme.typography.p.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
            const shad.Gap(16),
            shad.PrimaryButton(
              onPressed: onRetry,
              child: Text(l10n.commonRetry),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

class _EmptyView extends StatelessWidget {
  const _EmptyView({required this.onCreateWorkspace});

  final VoidCallback onCreateWorkspace;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return AppPageBody(
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.workspaces_outline,
              size: 56,
              color: theme.colorScheme.mutedForeground,
            ),
            const shad.Gap(16),
            Text(
              l10n.workspaceSelectEmpty,
              style: theme.typography.lead.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
            const shad.Gap(8),
            Text(
              l10n.workspaceCreatePrompt,
              textAlign: TextAlign.center,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
            const shad.Gap(24),
            shad.PrimaryButton(
              onPressed: onCreateWorkspace,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.add, size: 18),
                  const shad.Gap(8),
                  Text(l10n.workspaceCreateSubmit),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
