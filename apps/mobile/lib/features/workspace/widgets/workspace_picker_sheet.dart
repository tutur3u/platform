import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';

/// Shows a bottom sheet for switching between workspaces.
void showWorkspacePickerSheet(BuildContext context) {
  unawaited(
    showModalBottomSheet<void>(
      context: context,
      builder: (sheetContext) {
        final l10n = sheetContext.l10n;

        return BlocBuilder<WorkspaceCubit, WorkspaceState>(
          bloc: context.read<WorkspaceCubit>(),
          builder: (_, state) {
            return SafeArea(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                    child: Row(
                      children: [
                        Text(
                          l10n.workspacePickerTitle,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ],
                    ),
                  ),
                  const Divider(),
                  ...state.workspaces.map((workspace) {
                    final isSelected =
                        workspace.id == state.currentWorkspace?.id;

                    return ListTile(
                      leading: CircleAvatar(
                        child: workspace.personal
                            ? const Icon(Icons.person)
                            : Text(
                                workspace.name != null &&
                                        workspace.name!.isNotEmpty
                                    ? workspace.name![0].toUpperCase()
                                    : 'W',
                              ),
                      ),
                      title: Row(
                        children: [
                          Flexible(
                            child: Text(
                              workspace.name ?? workspace.id,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (workspace.personal) ...[
                            const SizedBox(width: 8),
                            Chip(
                              label: Text(
                                l10n.workspacePersonalBadge,
                                style: Theme.of(context).textTheme.labelSmall,
                              ),
                              materialTapTargetSize:
                                  MaterialTapTargetSize.shrinkWrap,
                              visualDensity: VisualDensity.compact,
                            ),
                          ],
                        ],
                      ),
                      trailing: isSelected
                          ? Icon(
                              Icons.check_circle,
                              color: Theme.of(context).colorScheme.primary,
                            )
                          : null,
                      onTap: () {
                        unawaited(
                          context.read<WorkspaceCubit>().selectWorkspace(
                            workspace,
                          ),
                        );
                        Navigator.pop(sheetContext);
                      },
                    );
                  }),
                  const SizedBox(height: 8),
                ],
              ),
            );
          },
        );
      },
    ),
  );
}
