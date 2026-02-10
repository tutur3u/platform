import 'package:flutter/material.dart'
    hide AppBar, Chip, CircleAvatar, FilledButton, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/create_workspace_dialog.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
import 'package:mobile/l10n/l10n.dart';
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
            return const Center(child: shad.CircularProgressIndicator());
          }

          if (state.status == WorkspaceStatus.error) {
            return _ErrorView(
              error: state.error,
              onRetry: () => context.read<WorkspaceCubit>().loadWorkspaces(),
            );
          }

          if (state.workspaces.isEmpty) {
            return _EmptyView(
              onCreateWorkspace: () => showCreateWorkspaceDialog(context),
            );
          }

          return _WorkspaceListView(
            state: state,
            isSelecting: _isSelecting,
            selectingWorkspaceId: _selectingWorkspaceId,
            onRefresh: () => context.read<WorkspaceCubit>().loadWorkspaces(),
            onSelect: _onSelectWorkspace,
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
        builder: (context, overlay) => shad.Alert.destructive(
          title: Text(l10n.workspaceSelectError),
        ),
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
    final theme = shad.Theme.of(context);

    final personal = state.workspaces.where((w) => w.personal).toList();
    final team = state.workspaces.where((w) => !w.personal).toList()
      ..sort((a, b) => (a.name ?? '').compareTo(b.name ?? ''));

    return RefreshIndicator(
      onRefresh: onRefresh,
      color: theme.colorScheme.primary,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          // Limits bar
          if (state.limits != null && state.limits!.limit > 0) ...[
            _LimitsBar(
              currentCount: state.limits!.currentCount,
              limit: state.limits!.limit,
            ),
            const shad.Gap(16),
          ],

          // Personal workspace section
          if (personal.isNotEmpty) ...[
            _SectionHeader(title: l10n.workspacePersonalSection),
            const shad.Gap(8),
            for (final w in personal) _buildTile(w),
          ],

          // Team workspaces section
          if (team.isNotEmpty) ...[
            if (personal.isNotEmpty) const shad.Gap(16),
            _SectionHeader(title: l10n.workspaceTeamSection),
            const shad.Gap(8),
            for (final w in team) _buildTile(w),
          ],
        ],
      ),
    );
  }

  Widget _buildTile(Workspace workspace) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: _WorkspaceTile(
        workspace: workspace,
        isSelected: workspace.id == state.currentWorkspace?.id,
        isLoading: isSelecting && selectingWorkspaceId == workspace.id,
        enabled: !isSelecting,
        onTap: () => onSelect(workspace),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Section header (uppercase label)
// ---------------------------------------------------------------------------

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: Text(
        title.toUpperCase(),
        style: theme.typography.small.copyWith(
          color: theme.colorScheme.mutedForeground,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Card-based workspace tile with animated selection state
// ---------------------------------------------------------------------------

class _WorkspaceTile extends StatelessWidget {
  const _WorkspaceTile({
    required this.workspace,
    required this.isSelected,
    required this.isLoading,
    required this.enabled,
    required this.onTap,
  });

  final Workspace workspace;
  final bool isSelected;
  final bool isLoading;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return GestureDetector(
      onTap: enabled ? onTap : null,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeInOut,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected
                ? theme.colorScheme.primary
                : theme.colorScheme.border,
          ),
          color: isSelected
              ? theme.colorScheme.primary.withValues(alpha: 0.05)
              : Colors.transparent,
        ),
        child: Row(
          children: [
            WorkspaceAvatar(workspace: workspace),
            const shad.Gap(14),
            Expanded(
              child: Row(
                children: [
                  Flexible(
                    child: Text(
                      workspace.name ?? workspace.id,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.p.copyWith(
                        fontWeight: isSelected
                            ? FontWeight.w600
                            : FontWeight.w500,
                      ),
                    ),
                  ),
                  if (workspace.personal) ...[
                    const shad.Gap(8),
                    shad.OutlineBadge(
                      child: Text(l10n.workspacePersonalBadge),
                    ),
                  ],
                ],
              ),
            ),
            const shad.Gap(8),
            if (isLoading)
              const shad.CircularProgressIndicator(size: 16)
            else if (isSelected)
              Icon(
                Icons.check_circle_rounded,
                color: theme.colorScheme.primary,
                size: 22,
              )
            else
              Icon(
                Icons.chevron_right_rounded,
                color: theme.colorScheme.mutedForeground,
                size: 20,
              ),
          ],
        ),
      ),
    );
  }
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

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
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

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
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
