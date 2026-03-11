import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/task_portfolio/cubit/task_portfolio_cubit.dart';
import 'package:mobile/features/task_portfolio/view/task_portfolio_actions.dart';
import 'package:mobile/features/task_portfolio/widgets/task_project_updates_section.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'task_project_detail_page_cards.dart';
part 'task_project_detail_page_states.dart';
part 'task_project_detail_page_utils.dart';
part 'task_project_detail_page_view.dart';

class TaskProjectDetailPage extends StatelessWidget {
  const TaskProjectDetailPage({
    required this.projectId,
    super.key,
    this.repository,
  });

  final String projectId;
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
        child: _TaskProjectDetailView(projectId: projectId),
      ),
    );
  }
}
