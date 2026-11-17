part of 'task_settings_section_page.dart';

extension _TaskSettingsSectionContent on _TaskSettingsSectionViewState {
  Widget _buildContent(BuildContext context) {
    return switch (widget.section) {
      TaskSettingsSection.labels =>
        BlocBuilder<TaskLabelsCubit, TaskLabelsState>(
          builder: (context, state) => _buildBody(
            hasData: state.labels.isNotEmpty,
            isLoading: state.status == TaskLabelsStatus.loading,
            error: state.status == TaskLabelsStatus.error ? state.error : null,
            items: () => [
              TaskLabelsSection(
                labels: state.labels,
                isSaving: state.status == TaskLabelsStatus.saving,
                onEdit: _openEditLabel,
                onDelete: _deleteLabel,
              ),
            ],
          ),
        ),
      TaskSettingsSection.projects || TaskSettingsSection.initiatives =>
        BlocBuilder<TaskPortfolioCubit, TaskPortfolioState>(
          builder: (context, state) => _buildBody(
            hasData: state.projects.isNotEmpty || state.initiatives.isNotEmpty,
            isLoading: state.status == TaskPortfolioStatus.loading,
            error: state.status == TaskPortfolioStatus.error
                ? state.error
                : null,
            items: () => widget.section == TaskSettingsSection.projects
                ? _buildProjectsItems(context, state)
                : _buildInitiativesItems(context, state),
          ),
        ),
    };
  }

  Widget _buildBody({
    required bool hasData,
    required bool isLoading,
    required String? error,
    required List<Widget> Function() items,
  }) {
    if (isCheckingPermissions && !hasResolvedPermissions && !hasData) {
      return const AppLoadingIndicator.page();
    }
    if (hasResolvedPermissions && !canManageProjects && !hasData) {
      return const TaskPortfolioAccessDenied();
    }
    if (isLoading && !hasData) return const AppLoadingIndicator.page();
    if (error != null && !hasData) {
      return TaskEstimatesErrorView(error: error);
    }
    return NovaRefreshIndicator(
      onRefresh: _reload,
      child: AppPageListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: items(),
      ),
    );
  }

  List<Widget> _buildProjectsItems(
    BuildContext context,
    TaskPortfolioState state,
  ) {
    if (state.projects.isEmpty) {
      return [
        TaskPortfolioEmptyState(
          icon: Icons.folder_open_outlined,
          title: context.l10n.taskPortfolioProjectsEmptyTitle,
          description: context.l10n.taskPortfolioProjectsEmptyDescription,
        ),
      ];
    }

    return state.projects.indexed
        .map((entry) {
          final project = entry.$2;
          return Padding(
            padding: EdgeInsets.only(
              bottom: entry.$1 == state.projects.length - 1
                  ? 0
                  : AppLayout.itemGap,
            ),
            child: PendingSyncFrame(
              workspaceId: project.wsId,
              entityId: project.id,
              feature: 'tasks',
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () =>
                    context.push(Routes.taskPortfolioProjectPath(project.id)),
                child: TaskProjectCard(
                  project: project,
                  onEdit: () => _openEditProject(project),
                  onDelete: () => _deleteProject(project),
                ),
              ),
            ),
          );
        })
        .toList(growable: false);
  }

  List<Widget> _buildInitiativesItems(
    BuildContext context,
    TaskPortfolioState state,
  ) {
    if (state.initiatives.isEmpty) {
      return [
        TaskPortfolioEmptyState(
          icon: Icons.account_tree_outlined,
          title: context.l10n.taskPortfolioInitiativesEmptyTitle,
          description: context.l10n.taskPortfolioInitiativesEmptyDescription,
        ),
      ];
    }

    return state.initiatives.indexed
        .map((entry) {
          final initiative = entry.$2;
          return Padding(
            padding: EdgeInsets.only(
              bottom: entry.$1 == state.initiatives.length - 1
                  ? 0
                  : AppLayout.itemGap,
            ),
            child: PendingSyncFrame(
              workspaceId:
                  context.read<WorkspaceCubit>().state.currentWorkspace?.id ??
                  '',
              entityId: initiative.id,
              feature: 'tasks',
              child: TaskInitiativeCard(
                initiative: initiative,
                onEdit: () => _openEditInitiative(initiative),
                onDelete: () => _deleteInitiative(initiative),
                onManageProjects: () => _manageInitiativeProjects(initiative),
              ),
            ),
          );
        })
        .toList(growable: false);
  }
}
