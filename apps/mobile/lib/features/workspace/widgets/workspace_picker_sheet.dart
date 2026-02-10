import 'dart:async';

import 'package:flutter/material.dart'
    hide Chip, CircleAvatar, Divider, NavigationBar, NavigationBarTheme;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/create_workspace_dialog.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Shows a bottom sheet for switching between workspaces.
void showWorkspacePickerSheet(BuildContext parentContext) {
  final workspaceCubit = parentContext.read<WorkspaceCubit>();

  unawaited(
    shad.openDrawer<void>(
      context: parentContext,
      position: shad.OverlayPosition.bottom,
      builder: (context) {
        return BlocProvider<WorkspaceCubit>.value(
          value: workspaceCubit,
          child: BlocBuilder<WorkspaceCubit, WorkspaceState>(
            builder: (_, state) {
              final l10n = context.l10n;
              final theme = shad.Theme.of(context);

              // Sort: personal first, then alphabetical
              final sorted = [...state.workspaces]
                ..sort((a, b) {
                  if (a.personal && !b.personal) return -1;
                  if (!a.personal && b.personal) return 1;
                  return (a.name ?? '').compareTo(b.name ?? '');
                });

              return ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.of(context).size.height * 0.65,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Header with create button
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 8, 0),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            l10n.workspacePickerTitle,
                            style: theme.typography.h3,
                          ),
                          shad.GhostButton(
                            size: shad.ButtonSize.small,
                            onPressed: (state.limits?.canCreate ?? true)
                                ? () async {
                                    await Navigator.maybePop(
                                      context,
                                    );
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
                                const Icon(Icons.add, size: 16),
                                const shad.Gap(4),
                                Text(l10n.workspaceCreateNew),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Limits info
                    if (state.limits != null && state.limits!.limit > 0)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(
                          16,
                          8,
                          16,
                          0,
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: shad.LinearProgressIndicator(
                                value:
                                    state.limits!.currentCount /
                                    state.limits!.limit,
                              ),
                            ),
                            const shad.Gap(12),
                            Text(
                              '${state.limits!.currentCount}'
                              ' / ${state.limits!.limit}',
                              style: theme.typography.small.copyWith(
                                color: theme.colorScheme.mutedForeground,
                              ),
                            ),
                          ],
                        ),
                      ),

                    const shad.Gap(8),
                    const shad.Divider(),

                    // Scrollable workspace list
                    Flexible(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 4,
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            for (final workspace in sorted)
                              _PickerTile(
                                workspace: workspace,
                                isSelected:
                                    workspace.id == state.currentWorkspace?.id,
                                onTap: () async {
                                  await Navigator.maybePop(
                                    context,
                                  );
                                  await workspaceCubit.selectWorkspace(
                                    workspace,
                                  );
                                },
                              ),
                          ],
                        ),
                      ),
                    ),
                    const shad.Gap(12),
                  ],
                ),
              );
            },
          ),
        );
      },
    ),
  );
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
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeInOut,
          padding: const EdgeInsets.symmetric(
            horizontal: 12,
            vertical: 10,
          ),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: isSelected
                  ? theme.colorScheme.primary
                  : Colors.transparent,
            ),
            color: isSelected
                ? theme.colorScheme.primary.withValues(alpha: 0.05)
                : Colors.transparent,
          ),
          child: Row(
            children: [
              WorkspaceAvatar(workspace: workspace),
              const shad.Gap(12),
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
                              : FontWeight.w400,
                        ),
                      ),
                    ),
                    if (workspace.personal) ...[
                      const shad.Gap(8),
                      shad.OutlineBadge(
                        child: Text(
                          l10n.workspacePersonalBadge,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (isSelected)
                Icon(
                  Icons.check_circle_rounded,
                  color: theme.colorScheme.primary,
                  size: 20,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
