import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';

class TaskListPage extends StatelessWidget {
  const TaskListPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) {
        final cubit = TaskListCubit(taskRepository: TaskRepository());
        final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
        if (wsId != null) unawaited(cubit.loadTasks(wsId));
        return cubit;
      },
      child: const _TaskListView(),
    );
  }
}

class _TaskListView extends StatelessWidget {
  const _TaskListView();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.tasksTitle)),
      body: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, state) {
          final wsId = state.currentWorkspace?.id;
          if (wsId != null) {
            unawaited(context.read<TaskListCubit>().loadTasks(wsId));
          }
        },
        child: BlocBuilder<TaskListCubit, TaskListState>(
          builder: (context, state) {
            if (state.status == TaskListStatus.loading) {
              return const Center(child: CircularProgressIndicator());
            }

            if (state.status == TaskListStatus.error) {
              return Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.error_outline,
                      size: 48,
                      color: Theme.of(context).colorScheme.error,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      state.error ?? l10n.tasksEmpty,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    FilledButton.tonal(
                      onPressed: () {
                        final wsId = context
                            .read<WorkspaceCubit>()
                            .state
                            .currentWorkspace
                            ?.id;
                        if (wsId != null) {
                          unawaited(
                            context.read<TaskListCubit>().loadTasks(wsId),
                          );
                        }
                      },
                      child: Text(l10n.commonRetry),
                    ),
                  ],
                ),
              );
            }

            if (state.tasks.isEmpty) {
              return Center(child: Text(l10n.tasksEmpty));
            }

            return ListView.builder(
              itemCount: state.tasks.length,
              itemBuilder: (context, index) {
                final task = state.tasks[index];
                return CheckboxListTile(
                  title: Text(task.name ?? ''),
                  subtitle: task.description != null
                      ? Text(
                          task.description!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        )
                      : null,
                  value: task.completed ?? false,
                  onChanged: (_) {
                    unawaited(
                      context.read<TaskListCubit>().toggleTaskCompletion(task),
                    );
                  },
                );
              },
            );
          },
        ),
      ),
    );
  }
}
