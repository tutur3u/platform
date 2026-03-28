part of 'task_project_detail_page.dart';

class _TaskProjectDetailView extends StatefulWidget {
  const _TaskProjectDetailView({required this.projectId});

  final String projectId;

  @override
  State<_TaskProjectDetailView> createState() => _TaskProjectDetailViewState();
}

class _TaskProjectDetailViewState extends State<_TaskProjectDetailView> {
  late final TaskRepository _taskRepository;

  TaskPortfolioActions get _actions =>
      TaskPortfolioActions(context: context, taskRepository: _taskRepository);

  @override
  void initState() {
    super.initState();
    _taskRepository = context.read<TaskRepository>();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final wsId = context.watch<WorkspaceCubit>().state.currentWorkspace?.id;
    final currentUserId = context.read<AuthCubit>().state.user?.id;

    return shad.Scaffold(
      headers: [
        MobileSectionAppBar(
          title: l10n.taskPortfolioTitle,
          leading: [
            shad.OutlineButton(
              density: shad.ButtonDensity.icon,
              onPressed: () {
                final router = GoRouter.of(context);
                if (router.canPop()) {
                  router.pop();
                  return;
                }
                context.go(Routes.taskPortfolio);
              },
              child: const Icon(Icons.arrow_back),
            ),
          ],
        ),
      ],
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, state) {
          final wsId = state.currentWorkspace?.id;
          if (wsId != null) {
            unawaited(context.read<TaskPortfolioCubit>().load(wsId));
          }
        },
        child: BlocBuilder<TaskPortfolioCubit, TaskPortfolioState>(
          builder: (context, state) {
            if (state.status == TaskPortfolioStatus.loading &&
                state.projects.isEmpty) {
              return const Center(child: NovaLoadingIndicator());
            }

            if (state.status == TaskPortfolioStatus.error &&
                state.projects.isEmpty) {
              return _ErrorState(message: state.error);
            }

            final project = wsId == null
                ? null
                : state.projects
                      .where(
                        (item) =>
                            item.id == widget.projectId && item.wsId == wsId,
                      )
                      .firstOrNull;

            if (project == null) {
              return _NotFoundState(
                title: l10n.taskPortfolioProjectNotFoundTitle,
                description: l10n.taskPortfolioProjectNotFoundDescription,
              );
            }

            return RefreshIndicator(
              onRefresh: _reload,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                children: [
                  _ProjectDetailsCard(
                    project: project,
                    isMutating: state.isMutating,
                    onEdit: () => _actions.openEditProject(project),
                    onDelete: () => _deleteProject(project),
                  ),
                  const shad.Gap(12),
                  _LinkedTasksCard(
                    project: project,
                    isMutating: state.isMutating,
                    onLinkTask: () => _openLinkTaskDialog(project),
                    onUnlinkTask: (taskId) => _unlinkTask(project.id, taskId),
                  ),
                  if (project.linkedTasks.isNotEmpty) ...[
                    const shad.Gap(12),
                    _ProjectStatsCard(project: project),
                  ],
                  if (wsId != null && currentUserId != null) ...[
                    const shad.Gap(12),
                    TaskProjectUpdatesSection(
                      workspaceId: wsId,
                      projectId: project.id,
                      currentUserId: currentUserId,
                      taskRepository: _taskRepository,
                    ),
                  ],
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Future<void> _reload() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    await context.read<TaskPortfolioCubit>().load(wsId);
  }

  Future<void> _openLinkTaskDialog(TaskProjectSummary project) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    final tasks = await (() async {
      try {
        return await _taskRepository.getWorkspaceTasksForProjectLinking(wsId);
      } on ApiException catch (error) {
        if (mounted) {
          _showErrorToast(
            error.message.trim().isEmpty
                ? context.l10n.commonSomethingWentWrong
                : error.message,
          );
        }
        return null;
      } on Exception {
        if (mounted) {
          _showErrorToast(context.l10n.commonSomethingWentWrong);
        }
        return null;
      }
    })();
    if (tasks == null) {
      return;
    }

    if (!mounted) return;

    final linkedIds = project.linkedTasks.map((task) => task.id).toSet();
    final availableTasks = tasks
        .where(
          (task) => !linkedIds.contains(task.id) && task.name.trim().isNotEmpty,
        )
        .toList(growable: false);

    String? selectedTaskId;
    var searchQuery = '';
    final didLink =
        await shad.showDialog<bool>(
          context: context,
          builder: (context) {
            return StatefulBuilder(
              builder: (context, setState) {
                return shad.AlertDialog(
                  title: Text(context.l10n.taskPortfolioLinkTask),
                  content: SizedBox(
                    width: double.maxFinite,
                    child: availableTasks.isEmpty
                        ? Text(
                            context.l10n.taskPortfolioNoAvailableTasks,
                            style: shad.Theme.of(context).typography.textMuted,
                          )
                        : Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              shad.TextField(
                                placeholder: Text(
                                  context.l10n.taskPortfolioSearchTasksHint,
                                ),
                                onChanged: (value) {
                                  setState(() => searchQuery = value);
                                },
                              ),
                              const shad.Gap(10),
                              Builder(
                                builder: (context) {
                                  final theme = shad.Theme.of(context);
                                  final foreground =
                                      theme.colorScheme.mutedForeground;
                                  final normalizedQuery = searchQuery
                                      .trim()
                                      .toLowerCase();
                                  final filteredTasks = availableTasks
                                      .where((task) {
                                        if (normalizedQuery.isEmpty) {
                                          return true;
                                        }
                                        return task.name.toLowerCase().contains(
                                              normalizedQuery,
                                            ) ||
                                            (task.listName
                                                    ?.toLowerCase()
                                                    .contains(
                                                      normalizedQuery,
                                                    ) ??
                                                false) ||
                                            (task.boardName
                                                    ?.toLowerCase()
                                                    .contains(
                                                      normalizedQuery,
                                                    ) ??
                                                false);
                                      })
                                      .toList(growable: false);

                                  if (filteredTasks.isEmpty) {
                                    return Text(
                                      normalizedQuery.isEmpty
                                          ? context
                                                .l10n
                                                .taskPortfolioNoAvailableTasks
                                          : context
                                                .l10n
                                                .taskPortfolioNoMatchingTasks,
                                      style: theme.typography.textMuted,
                                    );
                                  }

                                  return SizedBox(
                                    height: 280,
                                    child: ListView.separated(
                                      shrinkWrap: true,
                                      itemCount: filteredTasks.length,
                                      separatorBuilder: (_, _) =>
                                          const Divider(height: 1),
                                      itemBuilder: (context, index) {
                                        final task = filteredTasks[index];
                                        final isSelected =
                                            selectedTaskId == task.id;
                                        return InkWell(
                                          onTap: () {
                                            setState(
                                              () => selectedTaskId = task.id,
                                            );
                                          },
                                          child: Padding(
                                            padding: const EdgeInsets.symmetric(
                                              vertical: 12,
                                            ),
                                            child: Row(
                                              children: [
                                                Expanded(
                                                  child: Column(
                                                    crossAxisAlignment:
                                                        CrossAxisAlignment
                                                            .start,
                                                    children: [
                                                      Text(task.name.trim()),
                                                      if (task.listName
                                                              ?.trim()
                                                              .isNotEmpty ??
                                                          false) ...[
                                                        const shad.Gap(2),
                                                        Text(
                                                          task.listName!.trim(),
                                                          style: theme
                                                              .typography
                                                              .xSmall
                                                              .copyWith(
                                                                color:
                                                                    foreground,
                                                              ),
                                                        ),
                                                      ],
                                                    ],
                                                  ),
                                                ),
                                                const shad.Gap(12),
                                                Icon(
                                                  isSelected
                                                      ? Icons.check_circle
                                                      : Icons.circle_outlined,
                                                  size: 20,
                                                ),
                                              ],
                                            ),
                                          ),
                                        );
                                      },
                                    ),
                                  );
                                },
                              ),
                            ],
                          ),
                  ),
                  actions: [
                    shad.OutlineButton(
                      onPressed: () => Navigator.of(context).pop(false),
                      child: Text(context.l10n.commonCancel),
                    ),
                    shad.PrimaryButton(
                      onPressed: selectedTaskId == null
                          ? null
                          : () => Navigator.of(context).pop(true),
                      child: Text(context.l10n.taskPortfolioLinkTask),
                    ),
                  ],
                );
              },
            );
          },
        ) ??
        false;

    if (!didLink || selectedTaskId == null || !mounted) return;

    try {
      await context.read<TaskPortfolioCubit>().linkTaskToProject(
        wsId: wsId,
        projectId: project.id,
        taskId: selectedTaskId!,
      );
      if (!mounted) return;
      _showSuccessToast(context.l10n.taskPortfolioTaskLinked);
    } on ApiException catch (error) {
      if (mounted) {
        _showErrorToast(
          error.message.trim().isEmpty
              ? context.l10n.commonSomethingWentWrong
              : error.message,
        );
      }
    } on Exception {
      if (mounted) {
        _showErrorToast(context.l10n.commonSomethingWentWrong);
      }
    }
  }

  Future<void> _unlinkTask(String projectId, String taskId) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    try {
      await context.read<TaskPortfolioCubit>().unlinkTaskFromProject(
        wsId: wsId,
        projectId: projectId,
        taskId: taskId,
      );
      if (!mounted) return;
      _showSuccessToast(context.l10n.taskPortfolioTaskUnlinked);
    } on ApiException catch (error) {
      if (mounted) {
        _showErrorToast(
          error.message.trim().isEmpty
              ? context.l10n.commonSomethingWentWrong
              : error.message,
        );
      }
    } on Exception {
      if (mounted) {
        _showErrorToast(context.l10n.commonSomethingWentWrong);
      }
    }
  }

  Future<void> _deleteProject(TaskProjectSummary project) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final deleted =
        await shad.showDialog<bool>(
          context: context,
          builder: (_) => AsyncDeleteConfirmationDialog(
            title: context.l10n.taskPortfolioDeleteProject,
            message: context.l10n.taskPortfolioDeleteProjectConfirm,
            cancelLabel: context.l10n.commonCancel,
            confirmLabel: context.l10n.taskPortfolioDeleteProject,
            toastContext: toastContext,
            onConfirm: () async {
              await context.read<TaskPortfolioCubit>().deleteProject(
                wsId: wsId,
                projectId: project.id,
              );
            },
          ),
        ) ??
        false;

    if (!deleted || !mounted) return;
    _showSuccessToast(context.l10n.taskPortfolioProjectDeleted);
    if (GoRouter.of(context).canPop()) {
      context.pop();
    }
  }

  void _showSuccessToast(String message) {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (!toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => shad.Alert(content: Text(message)),
    );
  }

  void _showErrorToast(String message) {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (!toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) =>
          shad.Alert.destructive(content: Text(message)),
    );
  }
}
