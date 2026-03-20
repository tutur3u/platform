import 'package:flutter/material.dart'
    hide Chip, CircleAvatar, Divider, NavigationBar, NavigationBarTheme;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/create_workspace_dialog.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Shows a bottom drawer (compact) or dialog (medium+) for switching
/// between workspaces.
void showWorkspacePickerSheet(BuildContext parentContext) {
  final workspaceCubit = parentContext.read<WorkspaceCubit>();

  showAdaptiveDrawer(
    context: parentContext,
    builder: (context) {
      return BlocProvider<WorkspaceCubit>.value(
        value: workspaceCubit,
        child: BlocBuilder<WorkspaceCubit, WorkspaceState>(
          builder: (_, state) {
            final l10n = context.l10n;
            final theme = shad.Theme.of(context);
            final personal = state.workspaces.where((w) => w.personal).toList()
              ..sort((a, b) => (a.name ?? '').compareTo(b.name ?? ''));
            final team = state.workspaces.where((w) => !w.personal).toList()
              ..sort((a, b) => (a.name ?? '').compareTo(b.name ?? ''));

            return ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height * 0.66,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            l10n.workspacePickerTitle,
                            style: theme.typography.h3.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        shad.GhostButton(
                          size: shad.ButtonSize.small,
                          onPressed: (state.limits?.canCreate ?? true)
                              ? () async {
                                  await Navigator.maybePop(context);
                                  if (!parentContext.mounted) {
                                    return;
                                  }
                                  await showCreateWorkspaceDialog(
                                    parentContext,
                                  );
                                }
                              : null,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.add_rounded, size: 16),
                              const shad.Gap(4),
                              Text(l10n.workspaceCreateNew),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (state.limits != null && state.limits!.limit > 0)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                      child: _CompactLimitsBar(
                        currentCount: state.limits!.currentCount,
                        limit: state.limits!.limit,
                      ),
                    ),
                  const shad.Gap(10),
                  Flexible(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      child: Column(
                        children: [
                          if (personal.isNotEmpty)
                            _WorkspacePickerGroup(
                              title: l10n.workspacePersonalSection,
                              children: [
                                for (final workspace in personal)
                                  _PickerTile(
                                    workspace: workspace,
                                    isSelected:
                                        workspace.id ==
                                        state.currentWorkspace?.id,
                                    onTap: () async {
                                      await Navigator.maybePop(context);
                                      await workspaceCubit.selectWorkspace(
                                        workspace,
                                      );
                                    },
                                  ),
                              ],
                            ),
                          if (team.isNotEmpty) ...[
                            const shad.Gap(10),
                            _WorkspacePickerGroup(
                              title: l10n.workspaceTeamSection,
                              children: [
                                for (final workspace in team)
                                  _PickerTile(
                                    workspace: workspace,
                                    isSelected:
                                        workspace.id ==
                                        state.currentWorkspace?.id,
                                    onTap: () async {
                                      await Navigator.maybePop(context);
                                      await workspaceCubit.selectWorkspace(
                                        workspace,
                                      );
                                    },
                                  ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      );
    },
  );
}

class _WorkspacePickerGroup extends StatelessWidget {
  const _WorkspacePickerGroup({
    required this.title,
    required this.children,
  });

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 2, bottom: 6),
          child: Text(
            title.toUpperCase(),
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.mutedForeground,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
            ),
          ),
        ),
        Column(
          children: [
            for (var index = 0; index < children.length; index++) ...[
              if (index > 0)
                Container(
                  height: 1,
                  color: theme.colorScheme.border.withValues(alpha: 0.35),
                ),
              children[index],
            ],
          ],
        ),
      ],
    );
  }
}

class _CompactLimitsBar extends StatelessWidget {
  const _CompactLimitsBar({
    required this.currentCount,
    required this.limit,
  });

  final int currentCount;
  final int limit;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: theme.colorScheme.muted.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.4),
        ),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
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
                  fontWeight: FontWeight.w700,
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

/// Compact card tile for the workspace picker drawer.
class _PickerTile extends StatelessWidget {
  const _PickerTile({
    required this.workspace,
    required this.isSelected,
    required this.onTap,
  });

  final Workspace workspace;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: isSelected
                ? theme.colorScheme.primary.withValues(alpha: 0.08)
                : Colors.transparent,
          ),
          child: Row(
            children: [
              WorkspaceAvatar(workspace: workspace, radius: 15),
              const shad.Gap(10),
              Expanded(
                child: Text(
                  _displayWorkspaceName(context, workspace),
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.p.copyWith(
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w600,
                    fontSize: 15,
                  ),
                ),
              ),
              const shad.Gap(8),
              Icon(
                isSelected ? Icons.check_rounded : Icons.chevron_right_rounded,
                size: 16,
                color: isSelected
                    ? theme.colorScheme.primary
                    : theme.colorScheme.mutedForeground,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _displayWorkspaceName(BuildContext context, Workspace workspace) {
  final raw =
      workspace.name ??
      (workspace.personal ? context.l10n.workspacePersonalBadge : workspace.id);
  if (raw.toUpperCase() != raw) {
    return raw;
  }

  return raw
      .toLowerCase()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}
