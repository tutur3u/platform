import 'package:flutter/material.dart'
    hide AppBar, Chip, CircleAvatar, FilledButton, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
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
        shad.AppBar(title: Text(l10n.workspaceSelectTitle)),
      ],
      child: BlocBuilder<WorkspaceCubit, WorkspaceState>(
        builder: (context, state) {
          if (state.status == WorkspaceStatus.loading) {
            return const Center(child: shad.CircularProgressIndicator());
          }

          if (state.status == WorkspaceStatus.error) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.error_outline,
                    size: 48,
                    color: shad.Theme.of(context).colorScheme.destructive,
                  ),
                  const shad.Gap(16),
                  Text(
                    state.error ?? l10n.workspaceSelectEmpty,
                    textAlign: TextAlign.center,
                  ),
                  const shad.Gap(16),
                  shad.PrimaryButton(
                    onPressed: () =>
                        context.read<WorkspaceCubit>().loadWorkspaces(),
                    child: Text(l10n.commonRetry),
                  ),
                ],
              ),
            );
          }

          if (state.workspaces.isEmpty) {
            return Center(
              child: Text(l10n.workspaceSelectEmpty),
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: state.workspaces.length,
            separatorBuilder: (context, index) => const shad.Gap(8),
            itemBuilder: (context, index) {
              final workspace = state.workspaces[index];
              final isSelected = workspace.id == state.currentWorkspace?.id;
              final isLoading =
                  _isSelecting && _selectingWorkspaceId == workspace.id;

              return shad.GhostButton(
                onPressed: _isSelecting
                    ? null
                    : () async {
                        setState(() {
                          _isSelecting = true;
                          _selectingWorkspaceId = workspace.id;
                        });

                        try {
                          await context
                              .read<WorkspaceCubit>()
                              .selectWorkspace(workspace);
                          if (!context.mounted) {
                            return;
                          }
                        } on Exception catch (_) {
                          if (!context.mounted) {
                            return;
                          }
                          shad.showToast(
                            context: context,
                            builder: (context, overlay) =>
                                shad.Alert.destructive(
                              title: Text(l10n.workspaceSelectError),
                            ),
                          );
                        } finally {
                          if (context.mounted) {
                            setState(() {
                              _isSelecting = false;
                              _selectingWorkspaceId = null;
                            });
                          }
                        }
                      },
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    children: [
                      shad.Avatar(
                        initials: workspace.personal
                            ? 'P'
                            : (workspace.name != null &&
                                      workspace.name!.isNotEmpty
                                  ? workspace.name![0].toUpperCase()
                                  : 'W'),
                        backgroundColor: workspace.personal
                            ? shad.Theme.of(context).colorScheme.primary
                            : null,
                      ),
                      const shad.Gap(16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Flexible(
                                  child: Text(
                                    workspace.name ?? workspace.id,
                                    overflow: TextOverflow.ellipsis,
                                    style: shad.Theme.of(context).typography.p,
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
                          ],
                        ),
                      ),
                      if (isLoading)
                        const shad.CircularProgressIndicator(size: 16)
                      else if (isSelected)
                        Icon(
                          Icons.check_circle,
                          color: shad.Theme.of(context).colorScheme.primary,
                        ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
