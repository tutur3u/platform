import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';

class WorkspaceSelectPage extends StatelessWidget {
  const WorkspaceSelectPage({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.workspaceSelectTitle)),
      body: BlocBuilder<WorkspaceCubit, WorkspaceState>(
        builder: (context, state) {
          if (state.status == WorkspaceStatus.loading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (state.workspaces.isEmpty) {
            return Center(
              child: Text(l10n.workspaceSelectEmpty),
            );
          }

          return ListView.builder(
            itemCount: state.workspaces.length,
            itemBuilder: (context, index) {
              final workspace = state.workspaces[index];
              final isSelected =
                  workspace.id == state.currentWorkspace?.id;

              return ListTile(
                leading: CircleAvatar(
                  child: Text(
                    (workspace.name ?? 'W')[0].toUpperCase(),
                  ),
                ),
                title: Text(workspace.name ?? workspace.id),
                trailing: isSelected
                    ? Icon(
                        Icons.check_circle,
                        color: Theme.of(context).colorScheme.primary,
                      )
                    : null,
                onTap: () async {
                  await context
                      .read<WorkspaceCubit>()
                      .selectWorkspace(workspace);
                  if (context.mounted) context.go(Routes.home);
                },
              );
            },
          );
        },
      ),
    );
  }
}
