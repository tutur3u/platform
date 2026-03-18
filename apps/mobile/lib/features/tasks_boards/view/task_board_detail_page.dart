import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_link_option.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/task_relationships.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/tasks_boards/cubit/task_board_detail_cubit.dart';
import 'package:mobile/features/tasks_estimates/utils/task_label_colors.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/fab/fab_action.dart';
import 'package:mobile/widgets/fab/speed_dial_fab.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'task_board_detail_page_cards.dart';
part 'task_board_detail_page_actions.dart';
part 'task_board_detail_page_detail_sheet.dart';
part 'task_board_detail_page_list_form.dart';
part 'task_board_detail_page_sheet.dart';
part 'task_board_detail_page_sheet_logic.dart';
part 'task_board_detail_page_sheet_dialogs.dart';
part 'task_board_detail_page_sheet_widgets.dart';
part 'task_board_detail_page_states.dart';
part 'task_board_detail_page_utils.dart';
part 'task_board_detail_page_view.dart';

class TaskBoardDetailPage extends StatelessWidget {
  const TaskBoardDetailPage({
    required this.boardId,
    super.key,
    this.taskRepository,
    this.initialTaskId,
  });

  final String boardId;
  final TaskRepository? taskRepository;
  final String? initialTaskId;

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider<TaskRepository>(
      create: (_) => taskRepository ?? TaskRepository(),
      child: BlocProvider(
        create: (context) {
          final cubit = TaskBoardDetailCubit(
            taskRepository: context.read<TaskRepository>(),
          );
          final wsId = context
              .read<WorkspaceCubit>()
              .state
              .currentWorkspace
              ?.id;
          if (wsId != null) {
            unawaited(cubit.loadBoardDetail(wsId: wsId, boardId: boardId));
          }
          return cubit;
        },
        child: _TaskBoardDetailPageView(
          boardId: boardId,
          initialTaskId: initialTaskId,
        ),
      ),
    );
  }
}
