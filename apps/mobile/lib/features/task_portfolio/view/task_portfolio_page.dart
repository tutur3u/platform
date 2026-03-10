import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/task_portfolio/cubit/task_portfolio_cubit.dart';
import 'package:mobile/features/task_portfolio/view/task_portfolio_view.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';

class TaskPortfolioPage extends StatelessWidget {
  const TaskPortfolioPage({super.key, this.repository});

  final TaskRepository? repository;

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider<TaskRepository>(
      create: (_) => repository ?? TaskRepository(),
      child: BlocProvider(
        create: (context) {
          final cubit = TaskPortfolioCubit(
            taskRepository: context.read<TaskRepository>(),
          );
          final wsId = context
              .read<WorkspaceCubit>()
              .state
              .currentWorkspace
              ?.id;
          if (wsId != null) {
            unawaited(cubit.load(wsId));
          }
          return cubit;
        },
        child: const TaskPortfolioView(),
      ),
    );
  }
}
