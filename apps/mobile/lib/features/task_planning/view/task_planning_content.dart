part of 'task_planning_page.dart';

extension _TaskPlanningContent on _TaskPlanningViewState {
  Widget _buildContent(BuildContext context) {
    return BlocBuilder<TaskEstimatesCubit, TaskEstimatesState>(
      builder: (context, estimatesState) {
        return BlocBuilder<TaskLabelsCubit, TaskLabelsState>(
          builder: (context, labelsState) {
            return BlocBuilder<TaskPortfolioCubit, TaskPortfolioState>(
              builder: (context, portfolioState) {
                final hasVisibleData =
                    estimatesState.boards.isNotEmpty ||
                    labelsState.labels.isNotEmpty ||
                    portfolioState.projects.isNotEmpty ||
                    portfolioState.initiatives.isNotEmpty;

                if (_isCheckingPermissions &&
                    !_hasResolvedPermissions &&
                    !hasVisibleData) {
                  return const Center(child: NovaLoadingIndicator());
                }
                if (_hasResolvedPermissions &&
                    !_canManageProjects &&
                    !hasVisibleData) {
                  return const TaskPortfolioAccessDenied();
                }

                if (_isActiveTabLoading(
                  estimatesState,
                  labelsState,
                  portfolioState,
                )) {
                  return const Center(child: NovaLoadingIndicator());
                }

                final error = _activeTabError(
                  estimatesState,
                  labelsState,
                  portfolioState,
                );
                if (error != null) {
                  return TaskEstimatesErrorView(error: error);
                }

                final listBottomPadding =
                    _TaskPlanningViewState._fabContentBottomPadding +
                    MediaQuery.paddingOf(context).bottom;

                return ResponsiveWrapper(
                  maxWidth: ResponsivePadding.maxContentWidth(
                    context.deviceClass,
                  ),
                  child: RefreshIndicator(
                    onRefresh: _reload,
                    child: ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: EdgeInsets.fromLTRB(
                        16,
                        12,
                        16,
                        listBottomPadding,
                      ),
                      children: [
                        ..._activeTabItems(
                          context,
                          estimatesState,
                          labelsState,
                          portfolioState,
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
        );
      },
    );
  }

  bool _isActiveTabLoading(
    TaskEstimatesState estimatesState,
    TaskLabelsState labelsState,
    TaskPortfolioState portfolioState,
  ) {
    return switch (_activeTab) {
      _TaskPlanningTab.estimates =>
        estimatesState.status == TaskEstimatesStatus.loading &&
            estimatesState.boards.isEmpty,
      _TaskPlanningTab.labels =>
        labelsState.status == TaskLabelsStatus.loading &&
            labelsState.labels.isEmpty,
      _TaskPlanningTab.projects || _TaskPlanningTab.initiatives =>
        portfolioState.status == TaskPortfolioStatus.loading &&
            portfolioState.projects.isEmpty &&
            portfolioState.initiatives.isEmpty,
    };
  }

  String? _activeTabError(
    TaskEstimatesState estimatesState,
    TaskLabelsState labelsState,
    TaskPortfolioState portfolioState,
  ) {
    return switch (_activeTab) {
      _TaskPlanningTab.estimates
          when estimatesState.status == TaskEstimatesStatus.error &&
              estimatesState.boards.isEmpty =>
        estimatesState.error,
      _TaskPlanningTab.labels
          when labelsState.status == TaskLabelsStatus.error &&
              labelsState.labels.isEmpty =>
        labelsState.error,
      _TaskPlanningTab.projects || _TaskPlanningTab.initiatives
          when portfolioState.status == TaskPortfolioStatus.error &&
              portfolioState.projects.isEmpty &&
              portfolioState.initiatives.isEmpty =>
        portfolioState.error,
      _ => null,
    };
  }

  List<Widget> _activeTabItems(
    BuildContext context,
    TaskEstimatesState estimatesState,
    TaskLabelsState labelsState,
    TaskPortfolioState portfolioState,
  ) {
    return switch (_activeTab) {
      _TaskPlanningTab.estimates => [
        TaskEstimateBoardsSection(
          boards: estimatesState.boards,
          isUpdating: estimatesState.status == TaskEstimatesStatus.updating,
        ),
      ],
      _TaskPlanningTab.labels => [
        TaskLabelsSection(
          labels: labelsState.labels,
          isSaving: labelsState.status == TaskLabelsStatus.saving,
          onEdit: _openEditLabel,
          onDelete: _deleteLabel,
        ),
      ],
      _TaskPlanningTab.projects => _buildProjectsItems(context, portfolioState),
      _TaskPlanningTab.initiatives => _buildInitiativesItems(
        context,
        portfolioState,
      ),
    };
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
              bottom: entry.$1 == state.projects.length - 1 ? 0 : 12,
            ),
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
              bottom: entry.$1 == state.initiatives.length - 1 ? 0 : 12,
            ),
            child: TaskInitiativeCard(
              initiative: initiative,
              onEdit: () => _openEditInitiative(initiative),
              onDelete: () => _deleteInitiative(initiative),
              onManageProjects: () => _manageInitiativeProjects(initiative),
            ),
          );
        })
        .toList(growable: false);
  }
}
