import 'package:flutter/material.dart' hide AppBar, Card, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/ui.dart' show AppScaffold;
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/task_portfolio/cubit/task_portfolio_cubit.dart';
import 'package:mobile/features/task_settings/view/task_settings_permissions.dart';
import 'package:mobile/features/task_settings/view/task_settings_scope.dart';
import 'package:mobile/features/task_settings/widgets/task_settings_estimates_section.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_estimates_cubit.dart';
import 'package:mobile/features/tasks_estimates/cubit/task_labels_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// Task settings: Projects, Initiatives and Labels rows that open their
/// screens, and each board's estimation method.
class TaskSettingsPage extends StatelessWidget {
  const TaskSettingsPage({
    super.key,
    this.repository,
    this.permissionsRepository,
  });

  final TaskRepository? repository;
  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  Widget build(BuildContext context) {
    return TaskSettingsScope(
      repository: repository,
      estimates: true,
      labels: true,
      portfolio: true,
      child: TaskSettingsView(permissionsRepository: permissionsRepository),
    );
  }
}

class TaskSettingsView extends StatefulWidget {
  const TaskSettingsView({super.key, this.permissionsRepository});

  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  State<TaskSettingsView> createState() => _TaskSettingsViewState();
}

class _TaskSettingsViewState extends State<TaskSettingsView>
    with TaskSettingsPermissions {
  @override
  late final WorkspacePermissionsRepository permissionsRepository =
      widget.permissionsRepository ?? WorkspacePermissionsRepository();

  Future<void> _reload() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    await reloadTaskSettingsData(context, wsId, forceRefresh: true);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppScaffold(
      child: buildTaskSettingsListeners(
        child: NovaRefreshIndicator(
          onRefresh: _reload,
          child: AppPageListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              AppGroupedSection.spaced(
                caption: l10n.taskSettingsOrganiseSection,
                children: [
                  BlocBuilder<TaskPortfolioCubit, TaskPortfolioState>(
                    builder: (context, state) => _OrganiseRow(
                      id: 'projects',
                      icon: LucideIcons.folder,
                      title: l10n.taskPortfolioProjectsTab,
                      count: _portfolioCount(state, state.projects.length),
                      route: Routes.taskSettingsProjects,
                    ),
                  ),
                  BlocBuilder<TaskPortfolioCubit, TaskPortfolioState>(
                    builder: (context, state) => _OrganiseRow(
                      id: 'initiatives',
                      icon: LucideIcons.flag,
                      title: l10n.taskPortfolioInitiativesTab,
                      count: _portfolioCount(state, state.initiatives.length),
                      route: Routes.taskSettingsInitiatives,
                    ),
                  ),
                  BlocBuilder<TaskLabelsCubit, TaskLabelsState>(
                    builder: (context, state) => _OrganiseRow(
                      id: 'labels',
                      icon: LucideIcons.tag,
                      title: l10n.taskLabelsTab,
                      count:
                          state.status == TaskLabelsStatus.loaded ||
                              state.labels.isNotEmpty
                          ? state.labels.length
                          : null,
                      route: Routes.taskSettingsLabels,
                    ),
                  ),
                ],
              ),
              BlocBuilder<TaskEstimatesCubit, TaskEstimatesState>(
                builder: (context, state) => TaskSettingsEstimatesSection(
                  state: state,
                  canManage: canManageProjects,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static int? _portfolioCount(TaskPortfolioState state, int count) {
    final hasData = state.projects.isNotEmpty || state.initiatives.isNotEmpty;
    return state.status == TaskPortfolioStatus.loaded || hasData ? count : null;
  }
}

class _OrganiseRow extends StatelessWidget {
  const _OrganiseRow({
    required this.id,
    required this.icon,
    required this.title,
    required this.route,
    this.count,
  });

  final String id;
  final IconData icon;
  final String title;
  final String route;
  final int? count;

  @override
  Widget build(BuildContext context) {
    return AppGroupedRow(
      key: ValueKey('task-settings-$id'),
      leading: AppIconTile(icon: icon),
      title: Text(title),
      trailing: count == null ? null : Text('$count'),
      showChevron: true,
      onTap: () => context.push(route),
    );
  }
}
