import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Card, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart'
    show AppAlertVariant, AppScaffold, showAppToast;
import 'package:mobile/data/models/task_initiative_summary.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/task_portfolio/cubit/task_portfolio_cubit.dart';
import 'package:mobile/features/task_portfolio/view/task_portfolio_actions.dart';
import 'package:mobile/features/task_portfolio/widgets/task_portfolio_cards.dart';
import 'package:mobile/features/task_portfolio/widgets/task_portfolio_feedback.dart';
import 'package:mobile/features/task_settings/view/task_settings_permissions.dart';
import 'package:mobile/features/task_settings/view/task_settings_scope.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_labels_cubit.dart';
import 'package:mobile/features/tasks_estimates/widgets/task_estimates_feedback.dart';
import 'package:mobile/features/tasks_estimates/widgets/task_label_dialog.dart';
import 'package:mobile/features/tasks_estimates/widgets/task_labels_section.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:mobile/widgets/fab/extended_fab.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

part 'task_settings_section_actions.dart';
part 'task_settings_section_content.dart';

/// The lists opened from Task settings rows.
enum TaskSettingsSection { projects, initiatives, labels }

class TaskSettingsSectionPage extends StatelessWidget {
  const TaskSettingsSectionPage({
    required this.section,
    super.key,
    this.repository,
    this.permissionsRepository,
  });

  final TaskSettingsSection section;
  final TaskRepository? repository;
  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  Widget build(BuildContext context) {
    return TaskSettingsScope(
      repository: repository,
      labels: section == TaskSettingsSection.labels,
      portfolio: section != TaskSettingsSection.labels,
      child: TaskSettingsSectionView(
        section: section,
        permissionsRepository: permissionsRepository,
      ),
    );
  }
}

class TaskSettingsSectionView extends StatefulWidget {
  const TaskSettingsSectionView({
    required this.section,
    super.key,
    this.permissionsRepository,
  });

  final TaskSettingsSection section;
  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  State<TaskSettingsSectionView> createState() =>
      _TaskSettingsSectionViewState();
}

class _TaskSettingsSectionViewState extends State<TaskSettingsSectionView>
    with TaskSettingsPermissions {
  @override
  late final WorkspacePermissionsRepository permissionsRepository =
      widget.permissionsRepository ?? WorkspacePermissionsRepository();
  late final TaskRepository _taskRepository = context.read<TaskRepository>();

  TaskPortfolioActions get _portfolioActions =>
      TaskPortfolioActions(context: context, taskRepository: _taskRepository);

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fab = !canManageProjects
        ? null
        : switch (widget.section) {
            TaskSettingsSection.labels => ExtendedFab(
              label: l10n.taskLabelsCreate,
              icon: Icons.label_outline,
              onPressed: _openCreateLabel,
              includeBottomSafeArea: false,
            ),
            TaskSettingsSection.projects => ExtendedFab(
              label: l10n.taskPortfolioCreateProject,
              icon: Icons.folder_open_outlined,
              onPressed: _portfolioActions.openCreateProject,
              includeBottomSafeArea: false,
            ),
            TaskSettingsSection.initiatives => ExtendedFab(
              label: l10n.taskPortfolioCreateInitiative,
              icon: Icons.account_tree_outlined,
              onPressed: _portfolioActions.openCreateInitiative,
              includeBottomSafeArea: false,
            ),
          };
    return AppScaffold(
      child: buildTaskSettingsListeners(
        child: Stack(children: [_buildContent(context), ?fab]),
      ),
    );
  }
}
