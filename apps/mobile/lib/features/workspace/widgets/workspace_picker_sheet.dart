import 'dart:async';

import 'package:flutter/material.dart'
    hide Chip, CircleAvatar, Divider, NavigationBar, NavigationBarTheme;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Shows a bottom sheet for switching between workspaces.
void showWorkspacePickerSheet(BuildContext context) {
  final workspaceCubit = context.read<WorkspaceCubit>();

  unawaited(
    shad.openDrawer<void>(
      context: context,
      position: shad.OverlayPosition.bottom,
      builder: (context) {
        final l10n = context.l10n;

        return BlocProvider<WorkspaceCubit>.value(
          value: workspaceCubit,
          child: BlocBuilder<WorkspaceCubit, WorkspaceState>(
            builder: (_, state) {
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                    child: Row(
                      children: [
                        Text(
                          l10n.workspacePickerTitle,
                          style: shad.Theme.of(context).typography.h3,
                        ),
                      ],
                    ),
                  ),
                  const shad.Divider(),
                  ...state.workspaces.map((workspace) {
                    final isSelected =
                        workspace.id == state.currentWorkspace?.id;

                    return shad.GhostButton(
                      onPressed: () async {
                        // Close drawer and await completion before
                        // workspace change
                        await Navigator.maybePop(context);
                        // Only then select workspace
                        // (triggers router refresh safely)
                        await workspaceCubit.selectWorkspace(workspace);
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Row(
                          children: [
                            WorkspaceAvatar(workspace: workspace),
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
                                          style: shad.Theme.of(
                                            context,
                                          ).typography.p,
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
                                ],
                              ),
                            ),
                            if (isSelected)
                              Icon(
                                Icons.check_circle,
                                color: shad.Theme.of(
                                  context,
                                ).colorScheme.primary,
                              ),
                          ],
                        ),
                      ),
                    );
                  }),
                  const shad.Gap(16),
                ],
              );
            },
          ),
        );
      },
    ),
  );
}
