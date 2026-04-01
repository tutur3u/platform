part of 'task_board_detail_page.dart';

class _TaskBoardTaskDetailSheet extends StatefulWidget {
  const _TaskBoardTaskDetailSheet({
    required this.task,
    required this.board,
    required this.lists,
    required this.labels,
    required this.members,
    required this.projects,
    required this.isPersonalWorkspace,
  });

  final TaskBoardTask task;
  final TaskBoardDetail board;
  final List<TaskBoardList> lists;
  final List<TaskLabel> labels;
  final List<WorkspaceUserOption> members;
  final List<TaskProjectSummary> projects;
  final bool isPersonalWorkspace;

  @override
  State<_TaskBoardTaskDetailSheet> createState() =>
      _TaskBoardTaskDetailSheetState();
}

class _TaskBoardTaskDetailSheetState extends State<_TaskBoardTaskDetailSheet> {
  static const int _detailsTabIndex = 0;
  static const double _compactSheetMinSize = 0.2;
  static const double _compactSheetInitialSize = 0.4;
  static const double _compactSheetMaxSize = 0.95;

  late TaskBoardTask _task;
  int _activeTab = _detailsTabIndex;
  bool _isLoadingRelationships = false;
  String? _relationshipsError;
  bool _isDescriptionExpanded = false;
  int _relationshipLoadRequestToken = 0;

  @override
  void initState() {
    super.initState();
    _task = widget.task;
    if (!_task.relationshipsLoaded) {
      unawaited(_loadRelationships());
    }
  }

  @override
  void didUpdateWidget(covariant _TaskBoardTaskDetailSheet oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.task == widget.task) {
      return;
    }

    _task = widget.task;
    _relationshipLoadRequestToken += 1;
    _isLoadingRelationships = false;
    _relationshipsError = null;

    if (!_task.relationshipsLoaded) {
      unawaited(_loadRelationships());
    }
  }

  @override
  Widget build(BuildContext context) {
    if (context.isCompact) {
      final theme = shad.Theme.of(context);
      return DraggableScrollableSheet(
        initialChildSize: _compactSheetInitialSize,
        minChildSize: _compactSheetMinSize,
        maxChildSize: _compactSheetMaxSize,
        snap: true,
        snapSizes: const [
          _compactSheetMinSize,
          _compactSheetInitialSize,
          _compactSheetMaxSize,
        ],
        expand: false,
        builder: (context, scrollController) {
          return Container(
            decoration: BoxDecoration(
              color: theme.colorScheme.background,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(16),
              ),
            ),
            child: _buildScrollableBody(
              context,
              scrollController: scrollController,
            ),
          );
        },
      );
    }

    return _buildScrollableBody(context);
  }

  Widget _buildScrollableBody(
    BuildContext context, {
    ScrollController? scrollController,
  }) {
    final theme = shad.Theme.of(context);
    final title = _task.name?.trim().isNotEmpty == true
        ? _task.name!.trim()
        : context.l10n.taskBoardDetailUntitledTask;
    final description = _taskDescriptionParsed(_task.description);
    final assignees = _task.assignees
        .where(
          (assignee) =>
              (assignee.displayName?.trim().isNotEmpty ?? false) ||
              assignee.id.trim().isNotEmpty,
        )
        .toList(growable: false);

    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        controller: scrollController,
        padding: EdgeInsets.fromLTRB(
          16,
          12,
          16,
          24 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (context.isCompact) ...[
              Center(
                child: Container(
                  width: 44,
                  height: 4,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.mutedForeground.withValues(
                      alpha: 0.45,
                    ),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const shad.Gap(10),
            ],
            Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: theme.typography.large.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Tooltip(
                  message: context.l10n.taskBoardDetailEditTask,
                  child: shad.IconButton.ghost(
                    icon: const Icon(Icons.edit, size: 16),
                    onPressed: _openTaskEditor,
                  ),
                ),
                if (widget.lists.length > 1)
                  Tooltip(
                    message: context.l10n.taskBoardDetailMoveTask,
                    child: shad.IconButton.ghost(
                      icon: const Icon(Icons.swap_horiz, size: 16),
                      onPressed: _moveTask,
                    ),
                  ),
              ],
            ),
            const shad.Gap(16),
            shad.Tabs(
              index: _activeTab,
              onChanged: (value) => setState(() => _activeTab = value),
              children: [
                shad.TabItem(
                  child: Text(context.l10n.taskBoardDetailEditorDetailsTab),
                ),
                shad.TabItem(
                  child: _TaskEditorTabLabel(
                    label: context.l10n.taskBoardDetailEditorRelationshipsTab,
                    count: _task.relationships.totalCount,
                  ),
                ),
              ],
            ),
            const shad.Gap(12),
            if (_activeTab == _detailsTabIndex) ...[
              if (description != null) ...[
                _TaskBoardDescriptionAccordion(
                  label: context.l10n.taskBoardDetailTaskDescriptionLabel,
                  description: description,
                  isExpanded: _isDescriptionExpanded,
                  onToggle: () => setState(
                    () => _isDescriptionExpanded = !_isDescriptionExpanded,
                  ),
                ),
                const shad.Gap(12),
              ],
              if (_task.priority?.trim().isNotEmpty == true) ...[
                _TaskBoardTaskDetailRow(
                  label: context.l10n.taskBoardDetailPriority,
                  child: _TaskPriorityChip(priority: _task.priority),
                ),
                const shad.Gap(12),
              ],
              if (_task.startDate != null) ...[
                _TaskBoardTaskDetailRow(
                  label: context.l10n.taskBoardDetailTaskStartDate,
                  value: DateFormat.yMd().format(_task.startDate!),
                ),
                const shad.Gap(12),
              ],
              if (_task.endDate != null) ...[
                _TaskBoardTaskDetailRow(
                  label: context.l10n.taskBoardDetailTaskEndDate,
                  value: DateFormat.yMd().format(_task.endDate!),
                ),
                const shad.Gap(12),
              ],
              if (_task.estimationPoints != null) ...[
                _TaskBoardTaskDetailRow(
                  label: context.l10n.taskBoardDetailTaskEstimation,
                  child: shad.OutlineBadge(
                    child: Text(
                      _taskEstimationPointLabel(
                        points: _task.estimationPoints!,
                        board: widget.board,
                      ),
                    ),
                  ),
                ),
                const shad.Gap(12),
              ],
              if (assignees.isNotEmpty) ...[
                _TaskBoardTaskDetailRow(
                  label: context.l10n.taskBoardDetailTaskAssignees,
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: assignees
                        .map(
                          (assignee) => _AssigneeChip(
                            label:
                                assignee.displayName?.trim().isNotEmpty == true
                                ? assignee.displayName!.trim()
                                : assignee.id,
                            avatarUrl: assignee.avatarUrl,
                          ),
                        )
                        .toList(growable: false),
                  ),
                ),
                const shad.Gap(12),
              ],
              if (_task.labels.isNotEmpty) ...[
                _TaskBoardTaskDetailRow(
                  label: context.l10n.taskBoardDetailTaskLabels,
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _task.labels
                        .map(_TaskLabelBadge.new)
                        .toList(growable: false),
                  ),
                ),
                const shad.Gap(12),
              ],
              if (_task.projects.isNotEmpty) ...[
                _TaskBoardTaskDetailRow(
                  label: context.l10n.taskBoardDetailTaskProjects,
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _task.projects
                        .map(
                          (project) => _ProjectBadge(
                            label: _taskProjectLabel(project),
                          ),
                        )
                        .toList(growable: false),
                  ),
                ),
                const shad.Gap(12),
              ],
            ] else ...[
              if (_isLoadingRelationships)
                const LinearProgressIndicator(minHeight: 2),
              if (_relationshipsError != null) ...[
                const shad.Gap(8),
                Text(
                  _relationshipsError!,
                  style: shad.Theme.of(context).typography.small.copyWith(
                    color: shad.Theme.of(context).colorScheme.destructive,
                  ),
                ),
              ],
              ..._buildRelationshipSections(context),
            ],
          ],
        ),
      ),
    );
  }

  List<Widget> _buildRelationshipSections(BuildContext context) {
    final sections = <Widget>[
      if (_task.relationships.parentTask != null)
        _RelationshipSectionCard(
          title: context.l10n.taskBoardDetailParentTask,
          icon: _taskRelationshipIcon(_TaskRelationshipKind.parent),
          children: [
            _RelationshipTaskTile(
              task: _task.relationships.parentTask!,
              onNavigate: () => _navigateToLinkedTask(
                _task.relationships.parentTask!,
              ),
            ),
          ],
        ),
      if (_task.relationships.childTasks.isNotEmpty)
        _RelationshipSectionCard(
          title: context.l10n.taskBoardDetailChildTasks,
          icon: _taskRelationshipIcon(_TaskRelationshipKind.child),
          children: _task.relationships.childTasks
              .map(
                (task) => _RelationshipTaskTile(
                  task: task,
                  onNavigate: () => _navigateToLinkedTask(task),
                ),
              )
              .toList(growable: false),
        ),
      if (_task.relationships.blockedBy.isNotEmpty)
        _RelationshipSectionCard(
          title: context.l10n.taskBoardDetailBlockedBy,
          icon: _taskRelationshipIcon(_TaskRelationshipKind.blockedBy),
          children: _task.relationships.blockedBy
              .map(
                (task) => _RelationshipTaskTile(
                  task: task,
                  onNavigate: () => _navigateToLinkedTask(task),
                ),
              )
              .toList(growable: false),
        ),
      if (_task.relationships.blocking.isNotEmpty)
        _RelationshipSectionCard(
          title: context.l10n.taskBoardDetailBlocking,
          icon: _taskRelationshipIcon(_TaskRelationshipKind.blocking),
          children: _task.relationships.blocking
              .map(
                (task) => _RelationshipTaskTile(
                  task: task,
                  onNavigate: () => _navigateToLinkedTask(task),
                ),
              )
              .toList(growable: false),
        ),
      if (_task.relationships.relatedTasks.isNotEmpty)
        _RelationshipSectionCard(
          title: context.l10n.taskBoardDetailRelatedTasks,
          icon: _taskRelationshipIcon(_TaskRelationshipKind.related),
          children: _task.relationships.relatedTasks
              .map(
                (task) => _RelationshipTaskTile(
                  task: task,
                  onNavigate: () => _navigateToLinkedTask(task),
                ),
              )
              .toList(growable: false),
        ),
    ];

    if (sections.isEmpty) {
      return const [];
    }

    return [
      const shad.Gap(10),
      for (var index = 0; index < sections.length; index++) ...[
        if (index > 0) const shad.Gap(10),
        sections[index],
      ],
    ];
  }

  void _navigateToLinkedTask(RelatedTaskInfo linkedTask) {
    final state = context.read<TaskBoardDetailCubit>().state;
    final tasks = state.board?.tasks;
    if (tasks != null) {
      for (final task in tasks) {
        if (task.id != linkedTask.id) continue;
        setState(() {
          _task = task;
          _relationshipLoadRequestToken += 1;
          _activeTab = _detailsTabIndex;
          _isLoadingRelationships = false;
          _relationshipsError = null;
          _isDescriptionExpanded = false;
        });
        if (!task.relationshipsLoaded) {
          unawaited(_loadRelationships());
        }
        return;
      }
    }

    final linkedBoardId = linkedTask.boardId?.trim();
    if (linkedBoardId != null &&
        linkedBoardId.isNotEmpty &&
        linkedBoardId != widget.board.id) {
      final router = GoRouter.of(context);
      final destination = Uri(
        path: Routes.taskBoardDetailPath(linkedBoardId),
        queryParameters: {'taskId': linkedTask.id},
      );
      unawaited(_navigateAcrossBoard(router, destination));
      return;
    }

    setState(() {
      _relationshipsError = context.l10n.taskBoardDetailUnableToOpenLinkedTask;
    });
  }

  Future<void> _navigateAcrossBoard(GoRouter router, Uri destination) async {
    try {
      await Navigator.maybePop(context);
    } on Exception catch (error) {
      debugPrint('Task relationship overlay close failed: $error');
    }
    router.go(destination.toString());
  }

  Future<void> _openTaskEditor() async {
    final cubit = context.read<TaskBoardDetailCubit>();
    final content = BlocProvider.value(
      value: cubit,
      child: _TaskBoardTaskEditorSheet(
        task: _task,
        board: widget.board,
        lists: widget.lists,
        defaultListId: _task.listId,
        labels: widget.labels,
        members: widget.members,
        projects: widget.projects,
        isPersonalWorkspace: widget.isPersonalWorkspace,
      ),
    );

    await showAdaptiveDrawer(context: context, builder: (_) => content);

    if (!mounted) return;
    final refreshedTask = _findTaskInState(cubit.state, _task.id);
    if (refreshedTask != null) {
      setState(() => _task = refreshedTask);
      if (!refreshedTask.relationshipsLoaded) {
        unawaited(_loadRelationships());
      }
    }
  }

  Future<void> _loadRelationships() async {
    final requestTaskId = _task.id;
    final requestToken = ++_relationshipLoadRequestToken;

    setState(() {
      _isLoadingRelationships = true;
      _relationshipsError = null;
    });

    try {
      await context.read<TaskBoardDetailCubit>().loadTaskRelationships(
        taskId: requestTaskId,
      );

      if (!mounted) return;
      if (requestToken != _relationshipLoadRequestToken) return;
      if (_task.id != requestTaskId) return;
      final refreshedTask = _findTaskInState(
        context.read<TaskBoardDetailCubit>().state,
        requestTaskId,
      );
      setState(() {
        if (refreshedTask != null) {
          _task = refreshedTask;
        }
        _isLoadingRelationships = false;
        _relationshipsError = null;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      if (requestToken != _relationshipLoadRequestToken) return;
      if (_task.id != requestTaskId) return;
      final fallbackErrorMessage = context.l10n.commonSomethingWentWrong;
      setState(() {
        _isLoadingRelationships = false;
        _relationshipsError = error.message.trim().isEmpty
            ? fallbackErrorMessage
            : error.message;
      });
    } on Exception {
      if (!mounted) return;
      if (requestToken != _relationshipLoadRequestToken) return;
      if (_task.id != requestTaskId) return;
      final fallbackErrorMessage = context.l10n.commonSomethingWentWrong;
      setState(() {
        _isLoadingRelationships = false;
        _relationshipsError = fallbackErrorMessage;
      });
    }
  }

  TaskBoardTask? _findTaskInState(TaskBoardDetailState state, String taskId) {
    final tasks = state.board?.tasks;
    if (tasks == null) return null;

    for (final task in tasks) {
      if (task.id == taskId) {
        return task;
      }
    }

    return null;
  }

  Future<void> _moveTask() async {
    final availableLists = widget.lists
        .where((list) => list.id != _task.listId)
        .toList(growable: false);
    if (availableLists.isEmpty) {
      return;
    }

    final targetListId = await shad.showDialog<String>(
      context: context,
      builder: (context) => _MoveTaskListDialog(lists: availableLists),
    );

    if (targetListId == null || !mounted) return;

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final fallbackErrorMessage = context.l10n.commonSomethingWentWrong;
    try {
      await context.read<TaskBoardDetailCubit>().moveTask(
        taskId: _task.id,
        listId: targetListId,
      );

      if (!mounted || !toastContext.mounted) return;
      final refreshedTask = _findTaskInState(
        context.read<TaskBoardDetailCubit>().state,
        _task.id,
      );
      if (refreshedTask != null) {
        setState(() => _task = refreshedTask);
        if (!refreshedTask.relationshipsLoaded) {
          unawaited(_loadRelationships());
        }
      }

      shad.showToast(
        context: toastContext,
        builder: (context, overlay) =>
            shad.Alert(content: Text(context.l10n.taskBoardDetailTaskMoved)),
      );
    } on ApiException catch (error) {
      if (!mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(
            error.message.trim().isEmpty ? fallbackErrorMessage : error.message,
          ),
        ),
      );
    } on Exception {
      if (!mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) =>
            shad.Alert.destructive(content: Text(fallbackErrorMessage)),
      );
    }
  }
}
