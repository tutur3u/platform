part of 'task_board_detail_page.dart';

enum _TaskBoardTaskDetailSection { information, description, relationships }

class _TaskBoardTaskDetailFullscreenView extends StatefulWidget {
  const _TaskBoardTaskDetailFullscreenView({
    required this.task,
    required this.board,
    required this.lists,
    required this.labels,
    required this.members,
    required this.projects,
    required this.isPersonalWorkspace,
    required this.onClose,
    super.key,
  });

  final TaskBoardTask task;
  final TaskBoardDetail board;
  final List<TaskBoardList> lists;
  final List<TaskLabel> labels;
  final List<WorkspaceUserOption> members;
  final List<TaskProjectSummary> projects;
  final bool isPersonalWorkspace;
  final VoidCallback onClose;

  @override
  State<_TaskBoardTaskDetailFullscreenView> createState() =>
      _TaskBoardTaskDetailFullscreenViewState();
}

class _TaskBoardTaskDetailFullscreenViewState
    extends State<_TaskBoardTaskDetailFullscreenView> {
  _TaskBoardTaskDetailSection _section =
      _TaskBoardTaskDetailSection.description;
  bool _isDescriptionEditing = false;

  @override
  void didUpdateWidget(
    covariant _TaskBoardTaskDetailFullscreenView oldWidget,
  ) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.task.id != widget.task.id) {
      _section = _TaskBoardTaskDetailSection.description;
      _isDescriptionEditing = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final boardRoute = Routes.taskBoardDetailPath(widget.board.id);
    final taskTitle = _taskBoardTaskDetailTitle(context, widget.task);
    final hasShellMiniNav = lookupShellMiniNavCubit(context) != null;
    final theme = shad.Theme.of(context);

    return Stack(
      children: [
        Positioned.fill(
          child: ColoredBox(color: theme.colorScheme.background),
        ),
        ShellTitleOverride(
          ownerId: 'task-board-task-title-${widget.task.id}',
          locations: {boardRoute},
          title: taskTitle,
          showLeadingBrand: false,
          showAvatar: false,
          onTitleSubmitted: _saveShellTitle,
        ),
        ShellMiniNav(
          ownerId: 'task-board-task-mini-nav-${widget.task.id}',
          locations: {boardRoute},
          deepLinkBackRoute: boardRoute,
          items: [
            ShellMiniNavItemSpec(
              id: 'back',
              icon: Icons.chevron_left_rounded,
              label: context.l10n.navBack,
              callbackToken: 'task-back-${widget.task.id}',
              onPressed: widget.onClose,
            ),
            ShellMiniNavItemSpec(
              id: 'information',
              icon: Icons.info_outline_rounded,
              label: context.l10n.taskBoardDetailInformation,
              selected: _section == _TaskBoardTaskDetailSection.information,
              callbackToken: 'task-info-${widget.task.id}-$_section',
              onPressed: () => setState(() {
                _section = _TaskBoardTaskDetailSection.information;
                _isDescriptionEditing = false;
              }),
            ),
            ShellMiniNavItemSpec(
              id: 'description',
              icon: Icons.notes_rounded,
              label: context.l10n.taskBoardDetailTaskDescriptionLabel,
              selected: _section == _TaskBoardTaskDetailSection.description,
              callbackToken: 'task-description-${widget.task.id}-$_section',
              onPressed: () => setState(() {
                _section = _TaskBoardTaskDetailSection.description;
                _isDescriptionEditing = false;
              }),
            ),
            ShellMiniNavItemSpec(
              id: 'relationships',
              icon: Icons.account_tree_outlined,
              label: context.l10n.taskBoardDetailEditorRelationshipsTab,
              selected: _section == _TaskBoardTaskDetailSection.relationships,
              callbackToken: 'task-relationships-${widget.task.id}-$_section',
              onPressed: () => setState(() {
                _section = _TaskBoardTaskDetailSection.relationships;
                _isDescriptionEditing = false;
              }),
            ),
          ],
        ),
        _TaskBoardTaskDetailSheet(
          key: ValueKey<String>('task-detail-body-${widget.task.id}'),
          task: widget.task,
          board: widget.board,
          lists: widget.lists,
          labels: widget.labels,
          members: widget.members,
          projects: widget.projects,
          isPersonalWorkspace: widget.isPersonalWorkspace,
          isFullscreen: true,
          section: _section,
          isDescriptionEditing: _isDescriptionEditing,
          bottomContentPadding: hasShellMiniNav ? 0 : 88,
          fullscreenTitle: hasShellMiniNav
              ? null
              : _taskBoardTaskTitle(context, widget.task),
        ),
        if (!hasShellMiniNav)
          Align(
            alignment: Alignment.bottomCenter,
            child: _TaskBoardTaskDetailFallbackNav(
              section: _section,
              onBack: widget.onClose,
              onSectionChanged: (section) => setState(() {
                _section = section;
                _isDescriptionEditing = false;
              }),
            ),
          ),
        if (_section == _TaskBoardTaskDetailSection.description &&
            !_isDescriptionEditing)
          _TaskBoardTaskDescriptionEditFab(
            hasShellMiniNav: hasShellMiniNav,
            onPressed: () => setState(() => _isDescriptionEditing = true),
          ),
      ],
    );
  }

  Future<void> _saveShellTitle(String nextTitle) async {
    final title = nextTitle.trim();
    final currentTitle = (widget.task.name ?? '').trim();
    if (title.isEmpty || title == currentTitle) {
      return;
    }

    final workspaceMemberIds = {
      for (final member in widget.members) member.id,
    };
    final assigneeIds =
        workspaceMemberIds.isEmpty
              ? <String>[]
              : widget.task.assigneeIds
                    .where(workspaceMemberIds.contains)
                    .toList(growable: false)
          ..sort();

    await context.read<TaskBoardDetailCubit>().updateTask(
      taskId: widget.task.id,
      listId: widget.task.listId,
      name: title,
      priority: widget.task.priority,
      startDate: widget.task.startDate,
      endDate: widget.task.endDate,
      estimationPoints: widget.task.estimationPoints,
      assigneeIds: assigneeIds,
      labelIds: widget.task.labelIds,
      projectIds: widget.task.projectIds,
    );
  }
}

class _TaskBoardTaskDescriptionEditFab extends StatelessWidget {
  const _TaskBoardTaskDescriptionEditFab({
    required this.hasShellMiniNav,
    required this.onPressed,
  });

  final bool hasShellMiniNav;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final mediaPadding = MediaQuery.paddingOf(context);
    final injectedMiniNavInset = hasShellMiniNav ? 132 : 0;
    final bottomSafeArea = math.max<double>(
      0,
      mediaPadding.bottom - injectedMiniNavInset,
    );
    final bottom = 16 + bottomSafeArea;

    return Positioned(
      right: 16 + mediaPadding.right,
      bottom: bottom,
      child: Tooltip(
        message: context.l10n.taskBoardDetailTaskEditDescription,
        child: Semantics(
          label: context.l10n.taskBoardDetailTaskEditDescription,
          button: true,
          child: SizedBox.square(
            dimension: 56,
            child: shad.PrimaryButton(
              onPressed: onPressed,
              shape: shad.ButtonShape.circle,
              density: shad.ButtonDensity.icon,
              child: const Icon(Icons.edit, size: 24),
            ),
          ),
        ),
      ),
    );
  }
}

class _TaskBoardTaskDetailFallbackNav extends StatelessWidget {
  const _TaskBoardTaskDetailFallbackNav({
    required this.section,
    required this.onBack,
    required this.onSectionChanged,
  });

  final _TaskBoardTaskDetailSection section;
  final VoidCallback onBack;
  final ValueChanged<_TaskBoardTaskDetailSection> onSectionChanged;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.background,
        border: Border(
          top: BorderSide(
            color: theme.colorScheme.border.withValues(alpha: 0.72),
          ),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 10),
          child: Row(
            children: [
              _TaskBoardTaskDetailFallbackNavItem(
                icon: Icons.chevron_left_rounded,
                label: context.l10n.navBack,
                selected: false,
                onTap: onBack,
              ),
              _TaskBoardTaskDetailFallbackNavItem(
                icon: Icons.info_outline_rounded,
                label: context.l10n.taskBoardDetailInformation,
                selected: section == _TaskBoardTaskDetailSection.information,
                onTap: () => onSectionChanged(
                  _TaskBoardTaskDetailSection.information,
                ),
              ),
              _TaskBoardTaskDetailFallbackNavItem(
                icon: Icons.notes_rounded,
                label: context.l10n.taskBoardDetailTaskDescriptionLabel,
                selected: section == _TaskBoardTaskDetailSection.description,
                onTap: () => onSectionChanged(
                  _TaskBoardTaskDetailSection.description,
                ),
              ),
              _TaskBoardTaskDetailFallbackNavItem(
                icon: Icons.account_tree_outlined,
                label: context.l10n.taskBoardDetailEditorRelationshipsTab,
                selected: section == _TaskBoardTaskDetailSection.relationships,
                onTap: () => onSectionChanged(
                  _TaskBoardTaskDetailSection.relationships,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TaskBoardTaskDetailFallbackNavItem extends StatelessWidget {
  const _TaskBoardTaskDetailFallbackNavItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final color = selected
        ? theme.colorScheme.primary
        : theme.colorScheme.mutedForeground;

    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 20, color: color),
                const shad.Gap(2),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: theme.typography.small.copyWith(
                    color: color,
                    fontSize: 11,
                    fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

String _taskBoardTaskDetailTitle(BuildContext context, TaskBoardTask task) {
  return _taskBoardTaskTitle(context, task);
}

String _taskBoardTaskTitle(BuildContext context, TaskBoardTask task) {
  final title = task.name?.trim().isNotEmpty == true
      ? task.name!.trim()
      : context.l10n.taskBoardDetailUntitledTask;
  return title;
}

String? _taskBoardTaskIdentifier(TaskBoardDetail board, TaskBoardTask task) {
  final displayNumber = task.displayNumber;
  if (displayNumber == null) return null;
  final rawPrefix = board.ticketPrefix?.trim();
  final prefix = rawPrefix == null || rawPrefix.isEmpty ? 'TASK' : rawPrefix;
  return '${prefix.toUpperCase()}-$displayNumber';
}

class _TaskBoardTaskDetailSheet extends StatefulWidget {
  const _TaskBoardTaskDetailSheet({
    required this.task,
    required this.board,
    required this.lists,
    required this.labels,
    required this.members,
    required this.projects,
    required this.isPersonalWorkspace,
    this.isFullscreen = false,
    this.section,
    this.isDescriptionEditing = false,
    this.bottomContentPadding = 0,
    this.fullscreenTitle,
    super.key,
  });

  final TaskBoardTask task;
  final TaskBoardDetail board;
  final List<TaskBoardList> lists;
  final List<TaskLabel> labels;
  final List<WorkspaceUserOption> members;
  final List<TaskProjectSummary> projects;
  final bool isPersonalWorkspace;
  final bool isFullscreen;
  final _TaskBoardTaskDetailSection? section;
  final bool isDescriptionEditing;
  final double bottomContentPadding;
  final String? fullscreenTitle;

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
  bool _isMutatingRelationships = false;
  String? _relationshipsError;
  bool _isDescriptionExpanded = false;
  bool _isTitleEditing = false;
  bool _isSavingTitle = false;
  int _relationshipLoadRequestToken = 0;
  List<TaskLinkOption> _relationshipTaskOptions = const <TaskLinkOption>[];
  late final TextEditingController _titleController;
  late final FocusNode _titleFocusNode;

  bool get _isRelationshipBusy =>
      _isLoadingRelationships || _isMutatingRelationships;

  @override
  void initState() {
    super.initState();
    _task = widget.task;
    _titleController = TextEditingController(
      text: _task.name?.trim() ?? '',
    );
    _titleFocusNode = FocusNode();
    if (!_task.relationshipsLoaded) {
      unawaited(_loadRelationships());
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _titleFocusNode.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant _TaskBoardTaskDetailSheet oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.task == widget.task) {
      return;
    }

    _task = widget.task;
    if (!_isTitleEditing) {
      _titleController.text = _taskBoardTaskTitle(context, _task);
    }
    _relationshipLoadRequestToken += 1;
    _isLoadingRelationships = false;
    _relationshipsError = null;

    if (!_task.relationshipsLoaded) {
      unawaited(_loadRelationships());
    }
  }

  void _startTitleEdit() {
    if (_isSavingTitle) return;
    setState(() {
      _isTitleEditing = true;
      _titleController.text = _taskBoardTaskTitle(context, _task);
      _titleController.selection = TextSelection(
        baseOffset: 0,
        extentOffset: _titleController.text.length,
      );
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _titleFocusNode.requestFocus();
      }
    });
  }

  Future<void> _saveTitleEdit() async {
    _titleFocusNode.unfocus();
    final nextTitle = _titleController.text.trim();
    final currentTitle = (_task.name ?? '').trim();
    if (nextTitle.isEmpty) {
      _titleController.text = _taskBoardTaskTitle(context, _task);
      setState(() => _isTitleEditing = false);
      return;
    }
    if (nextTitle == currentTitle) {
      setState(() => _isTitleEditing = false);
      return;
    }

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    setState(() => _isSavingTitle = true);
    try {
      final cubit = context.read<TaskBoardDetailCubit>();
      await cubit.updateTask(
        taskId: _task.id,
        listId: _task.listId,
        name: nextTitle,
        priority: _task.priority,
        startDate: _task.startDate,
        endDate: _task.endDate,
        estimationPoints: _task.estimationPoints,
        assigneeIds: _task.assigneeIds,
        labelIds: _task.labelIds,
        projectIds: _task.projectIds,
      );
      if (!mounted) return;
      final updatedTask = _findTaskInState(cubit.state, _task.id);
      setState(() {
        _task = updatedTask ?? _task.copyWith(name: nextTitle);
        _titleController.text = _taskBoardTaskTitle(context, _task);
        _isTitleEditing = false;
      });
    } on Object catch (error) {
      if (!mounted || !toastContext.mounted) return;
      final fallbackMessage = context.l10n.commonSomethingWentWrong;
      final message = error.toString().trim();
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(message.isEmpty ? fallbackMessage : message),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _isSavingTitle = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.isFullscreen && context.isCompact) {
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
        builder: (context, scrollController) => _buildScrollableBody(
          context,
          scrollController: scrollController,
        ),
      );
    }

    return _buildScrollableBody(context);
  }

  Widget _buildFullscreenDescriptionBody(BuildContext context) {
    final hasFullscreenTitle =
        widget.fullscreenTitle?.trim().isNotEmpty == true;

    return SafeArea(
      top: false,
      bottom: false,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final bodyHeight = constraints.maxHeight.isFinite
              ? math.max<double>(0, constraints.maxHeight)
              : 0.toDouble();
          final descriptionBody = _buildDescriptionSection(
            context,
            _taskDescriptionParsed(_task.description),
            fullscreenImmersive: true,
            minHeight: hasFullscreenTitle ? null : bodyHeight,
          );

          return SizedBox(
            width: double.infinity,
            height: bodyHeight,
            child: hasFullscreenTitle
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                        child: _buildFullscreenHeader(
                          context,
                          section: _TaskBoardTaskDetailSection.description,
                        ),
                      ),
                      const shad.Gap(12),
                      Expanded(child: descriptionBody),
                    ],
                  )
                : descriptionBody,
          );
        },
      ),
    );
  }

  Widget _buildFullscreenDescriptionEditorBody(BuildContext context) {
    final hasFullscreenTitle =
        widget.fullscreenTitle?.trim().isNotEmpty == true;
    final bottomInset =
        widget.bottomContentPadding + MediaQuery.viewInsetsOf(context).bottom;

    Widget buildEditorBody() {
      return Padding(
        padding: EdgeInsets.only(bottom: bottomInset),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final editorHeight = constraints.maxHeight.isFinite
                ? math.max<double>(0, constraints.maxHeight)
                : 0.toDouble();

            return _buildEmbeddedTaskEditor(
              context,
              section: _TaskBoardTaskDetailSection.description,
              minHeight: editorHeight,
            );
          },
        ),
      );
    }

    return SafeArea(
      top: false,
      bottom: false,
      child: SizedBox.expand(
        child: hasFullscreenTitle
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: _buildFullscreenHeader(
                      context,
                      section: _TaskBoardTaskDetailSection.description,
                    ),
                  ),
                  const shad.Gap(12),
                  Expanded(child: buildEditorBody()),
                ],
              )
            : buildEditorBody(),
      ),
    );
  }

  Widget _buildFullscreenSectionBody(
    BuildContext context, {
    required _TaskBoardTaskDetailSection section,
    ScrollController? scrollController,
  }) {
    final hasFullscreenTitle =
        widget.fullscreenTitle?.trim().isNotEmpty == true;
    final showHeader =
        section == _TaskBoardTaskDetailSection.information ||
        hasFullscreenTitle;
    final bottomInset =
        widget.bottomContentPadding + MediaQuery.viewInsetsOf(context).bottom;

    Widget buildSectionContent() {
      return LayoutBuilder(
        builder: (context, constraints) {
          final contentHeight = constraints.maxHeight.isFinite
              ? math.max<double>(0, constraints.maxHeight)
              : 0.toDouble();

          return SingleChildScrollView(
            controller: scrollController,
            padding: EdgeInsets.fromLTRB(16, 0, 16, bottomInset),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: contentHeight),
              child: switch (section) {
                _TaskBoardTaskDetailSection.information =>
                  _buildEmbeddedTaskEditor(
                    context,
                    section: _TaskBoardTaskDetailSection.information,
                    minHeight: contentHeight,
                  ),
                _TaskBoardTaskDetailSection.relationships =>
                  _buildEmbeddedTaskEditor(
                    context,
                    section: _TaskBoardTaskDetailSection.relationships,
                    minHeight: contentHeight,
                  ),
                _TaskBoardTaskDetailSection.description =>
                  _buildDescriptionSection(
                    context,
                    _taskDescriptionParsed(_task.description),
                    fullscreenImmersive: true,
                    minHeight: contentHeight,
                  ),
              },
            ),
          );
        },
      );
    }

    return SafeArea(
      top: false,
      bottom: false,
      child: SizedBox.expand(
        child: showHeader
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: _buildFullscreenHeader(context, section: section),
                  ),
                  const shad.Gap(12),
                  Expanded(child: buildSectionContent()),
                ],
              )
            : buildSectionContent(),
      ),
    );
  }

  Widget _buildScrollableBody(
    BuildContext context, {
    ScrollController? scrollController,
  }) {
    final title = _task.name?.trim().isNotEmpty == true
        ? _task.name!.trim()
        : context.l10n.taskBoardDetailUntitledTask;
    final section =
        widget.section ??
        (_activeTab == _detailsTabIndex
            ? _TaskBoardTaskDetailSection.information
            : _TaskBoardTaskDetailSection.relationships);
    final isFullscreenDescription =
        widget.isFullscreen &&
        section == _TaskBoardTaskDetailSection.description;
    if (isFullscreenDescription && !widget.isDescriptionEditing) {
      return _buildFullscreenDescriptionBody(context);
    }
    if (isFullscreenDescription && widget.isDescriptionEditing) {
      return _buildFullscreenDescriptionEditorBody(context);
    }
    if (widget.isFullscreen) {
      return _buildFullscreenSectionBody(
        context,
        section: section,
        scrollController: scrollController,
      );
    }

    final hasFullscreenTitle =
        widget.fullscreenTitle?.trim().isNotEmpty == true;
    final shouldShowHeader =
        !widget.isFullscreen ||
        section == _TaskBoardTaskDetailSection.information ||
        hasFullscreenTitle;
    final horizontalPadding = (isFullscreenDescription ? 0 : 16).toDouble();
    final topPadding = (shouldShowHeader ? 12 : 0).toDouble();
    final bottomPadding =
        (isFullscreenDescription ? 0 : 24) +
        widget.bottomContentPadding +
        MediaQuery.viewInsetsOf(context).bottom;

    return SafeArea(
      top: false,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final availableBodyHeight = constraints.maxHeight.isFinite
              ? math.max<double>(
                  0,
                  constraints.maxHeight - topPadding - bottomPadding,
                )
              : 0.toDouble();

          return SingleChildScrollView(
            controller: scrollController,
            padding: EdgeInsets.fromLTRB(
              horizontalPadding,
              topPadding,
              horizontalPadding,
              bottomPadding,
            ),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: availableBodyHeight),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (shouldShowHeader) ...[
                    Padding(
                      padding: EdgeInsets.symmetric(
                        horizontal: isFullscreenDescription ? 16 : 0,
                      ),
                      child: widget.isFullscreen
                          ? _buildFullscreenHeader(context, section: section)
                          : _buildSheetHeaderRow(context, title),
                    ),
                    const shad.Gap(12),
                  ],
                  if (!widget.isFullscreen) ...[
                    const shad.Gap(4),
                    shad.Tabs(
                      index: _activeTab,
                      onChanged: (value) => setState(() => _activeTab = value),
                      children: [
                        shad.TabItem(
                          child: Text(
                            context.l10n.taskBoardDetailEditorDetailsTab,
                          ),
                        ),
                        shad.TabItem(
                          child: _TaskEditorTabLabel(
                            label: context
                                .l10n
                                .taskBoardDetailEditorRelationshipsTab,
                            count: _task.relationships.totalCount,
                          ),
                        ),
                      ],
                    ),
                  ],
                  switch (section) {
                    _TaskBoardTaskDetailSection.information =>
                      widget.isFullscreen
                          ? _buildEmbeddedTaskEditor(
                              context,
                              section: _TaskBoardTaskDetailSection.information,
                              minHeight: availableBodyHeight,
                            )
                          : _buildInformationSection(context),
                    _TaskBoardTaskDetailSection.description =>
                      widget.isFullscreen && widget.isDescriptionEditing
                          ? _buildEmbeddedTaskEditor(
                              context,
                              section: _TaskBoardTaskDetailSection.description,
                              minHeight: availableBodyHeight,
                            )
                          : _buildDescriptionSection(
                              context,
                              _taskDescriptionParsed(_task.description),
                              fullscreenImmersive: isFullscreenDescription,
                              minHeight: availableBodyHeight,
                            ),
                    _TaskBoardTaskDetailSection.relationships =>
                      widget.isFullscreen
                          ? _buildEmbeddedTaskEditor(
                              context,
                              section:
                                  _TaskBoardTaskDetailSection.relationships,
                              minHeight: availableBodyHeight,
                            )
                          : _buildRelationshipsContent(context),
                  },
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildSheetHeaderRow(BuildContext context, String title) {
    final theme = shad.Theme.of(context);

    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: theme.typography.large.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        _buildTaskActionButtons(context),
      ],
    );
  }

  Widget _buildFullscreenActionsRow(BuildContext context) {
    final identifier = _taskBoardTaskIdentifier(widget.board, _task);

    return Row(
      children: [
        if (identifier != null) ...[
          shad.OutlineBadge(
            child: Text(identifier),
          ),
          const shad.Gap(8),
        ],
        const Spacer(),
        _buildTaskActionButtons(context),
      ],
    );
  }

  Widget _buildFullscreenHeader(
    BuildContext context, {
    required _TaskBoardTaskDetailSection section,
  }) {
    final title = widget.fullscreenTitle?.trim().isNotEmpty == true
        ? _taskBoardTaskTitle(context, _task)
        : null;
    final showActions = section == _TaskBoardTaskDetailSection.information;

    if (title == null || title.trim().isEmpty) {
      return showActions
          ? _buildFullscreenActionsRow(context)
          : const SizedBox.shrink();
    }

    final titleWidget = _isTitleEditing
        ? _buildFullscreenTitleEditor(context, title)
        : _buildFullscreenScrollableTitle(context, title);

    if (!showActions) {
      return titleWidget;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        titleWidget,
        const shad.Gap(10),
        _buildFullscreenActionsRow(context),
      ],
    );
  }

  Widget _buildFullscreenScrollableTitle(BuildContext context, String title) {
    final theme = shad.Theme.of(context);
    final titleStyle = theme.typography.large.copyWith(
      fontWeight: FontWeight.w800,
    );

    return Semantics(
      button: true,
      label: title,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: _startTitleEdit,
        child: SizedBox(
          height: 48,
          width: double.infinity,
          child: LayoutBuilder(
            builder: (context, constraints) {
              return ShaderMask(
                blendMode: BlendMode.dstIn,
                shaderCallback: (bounds) {
                  return const LinearGradient(
                    colors: [
                      Colors.white,
                      Colors.white,
                      Colors.transparent,
                    ],
                    stops: [0, 0.84, 1],
                  ).createShader(bounds);
                },
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  physics: const BouncingScrollPhysics(),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      minWidth: constraints.maxWidth,
                    ),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        title,
                        maxLines: 1,
                        softWrap: false,
                        style: titleStyle,
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildFullscreenTitleEditor(BuildContext context, String title) {
    final theme = shad.Theme.of(context);

    return SizedBox(
      height: 48,
      width: double.infinity,
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _titleController,
              focusNode: _titleFocusNode,
              enabled: !_isSavingTitle,
              scrollPadding: EdgeInsets.zero,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) {
                FocusScope.of(context).unfocus();
                unawaited(_saveTitleEdit());
              },
              style: theme.typography.large.copyWith(
                fontWeight: FontWeight.w800,
              ),
              decoration: InputDecoration(
                hintText: title,
                isDense: true,
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(vertical: 8),
              ),
            ),
          ),
          const shad.Gap(8),
          Tooltip(
            message: context.l10n.commonSave,
            child: shad.IconButton.ghost(
              onPressed: _isSavingTitle
                  ? null
                  : () => unawaited(_saveTitleEdit()),
              icon: _isSavingTitle
                  ? const _TaskButtonLoadingIndicator()
                  : const Icon(Icons.check_rounded, size: 20),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTaskActionButtons(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (!widget.isFullscreen)
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
        Tooltip(
          message: context.l10n.taskBoardDetailDeleteTask,
          child: shad.IconButton.ghost(
            icon: const Icon(Icons.delete_outline, size: 16),
            onPressed: _deleteTask,
          ),
        ),
      ],
    );
  }

  Widget _buildInformationSection(
    BuildContext context,
  ) {
    final assignees = _task.assignees
        .where(
          (assignee) =>
              (assignee.displayName?.trim().isNotEmpty ?? false) ||
              assignee.id.trim().isNotEmpty,
        )
        .toList(growable: false);
    final description = _taskDescriptionParsed(_task.description);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
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
                      label: assignee.displayName?.trim().isNotEmpty == true
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
                  .toList(
                    growable: false,
                  ),
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
      ],
    );
  }

  Widget _buildDescriptionSection(
    BuildContext context,
    ParsedTipTapDescription? description, {
    bool fullscreenImmersive = false,
    double? minHeight,
  }) {
    if (description == null) {
      final theme = shad.Theme.of(context);
      return Container(
        width: double.infinity,
        constraints: BoxConstraints(
          minHeight: fullscreenImmersive ? (minHeight ?? 220) : 220,
        ),
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: fullscreenImmersive
              ? Colors.transparent
              : theme.colorScheme.muted.withValues(alpha: 0.22),
          borderRadius: BorderRadius.circular(fullscreenImmersive ? 0 : 20),
          border: fullscreenImmersive
              ? null
              : Border.all(
                  color: theme.colorScheme.border.withValues(alpha: 0.76),
                ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Icon(
                  Icons.notes_rounded,
                  size: 28,
                  color: theme.colorScheme.primary,
                ),
              ),
            ),
            const shad.Gap(18),
            Text(
              context.l10n.taskBoardDetailTaskNoDescription,
              style: theme.typography.h4.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const shad.Gap(8),
            Text(
              context.l10n.taskBoardDetailTaskDescriptionHint,
              style: theme.typography.small.copyWith(
                color: theme.colorScheme.mutedForeground,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      );
    }

    if (fullscreenImmersive) {
      return SizedBox(
        width: double.infinity,
        height: minHeight,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
          child: _TaskBoardDescriptionDocument(description: description),
        ),
      );
    }

    return _TaskBoardDescriptionAccordion(
      label: context.l10n.taskBoardDetailTaskDescriptionLabel,
      description: description,
      isExpanded: true,
      onToggle: () {},
      canCollapse: false,
    );
  }

  Widget _buildEmbeddedTaskEditor(
    BuildContext context, {
    required _TaskBoardTaskDetailSection section,
    double? minHeight,
  }) {
    return BlocProvider.value(
      value: context.read<TaskBoardDetailCubit>(),
      child: _TaskBoardTaskEditorSheet(
        key: ValueKey<String>('embedded-task-editor-${_task.id}'),
        task: _task,
        board: widget.board,
        lists: widget.lists,
        defaultListId: _task.listId,
        labels: widget.labels,
        members: widget.members,
        projects: widget.projects,
        isPersonalWorkspace: widget.isPersonalWorkspace,
        embedded: true,
        embeddedSection: section,
        embeddedMinHeight: minHeight,
        onTaskChanged: (task) {
          if (mounted) {
            setState(() => _task = task);
          }
        },
      ),
    );
  }

  Widget _buildRelationshipsContent(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
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
        const shad.Gap(10),
        ..._buildRelationshipEditorSections(context),
      ],
    );
  }

  List<Widget> _buildRelationshipEditorSections(BuildContext context) {
    final relationships = _task.relationships;
    return [
      _RelationshipSectionCard(
        title: context.l10n.taskBoardDetailParentTask,
        icon: _taskRelationshipIcon(_TaskRelationshipKind.parent),
        children: [
          if (relationships.parentTask != null)
            _RelationshipTaskTile(
              task: relationships.parentTask!,
              onNavigate: () =>
                  _navigateToLinkedTask(relationships.parentTask!),
              onRemove: _isRelationshipBusy
                  ? null
                  : () => _removeTaskRelationshipFromDetail(
                      relationships.parentTask!,
                      role: _TaskRelationshipRole.parentTask,
                    ),
            )
          else
            Text(
              context.l10n.taskBoardDetailNone,
              style: shad.Theme.of(context).typography.small,
            ),
          const shad.Gap(8),
          _SelectionFieldButton(
            label: context.l10n.taskBoardDetailAddParentTask,
            value: context.l10n.taskBoardDetailSelectTask,
            enabled: !_isRelationshipBusy,
            onPressed: () => _pickTaskRelationshipForDetail(
              role: _TaskRelationshipRole.parentTask,
            ),
          ),
        ],
      ),
      const shad.Gap(10),
      _RelationshipSectionCard(
        title: context.l10n.taskBoardDetailChildTasks,
        icon: _taskRelationshipIcon(_TaskRelationshipKind.child),
        children: [
          if (relationships.childTasks.isEmpty)
            Text(
              context.l10n.taskBoardDetailNone,
              style: shad.Theme.of(context).typography.small,
            ),
          ...relationships.childTasks.map(
            (task) => Padding(
              padding: const EdgeInsets.only(top: 8),
              child: _RelationshipTaskTile(
                task: task,
                onNavigate: () => _navigateToLinkedTask(task),
                onRemove: _isRelationshipBusy
                    ? null
                    : () => _removeTaskRelationshipFromDetail(
                        task,
                        role: _TaskRelationshipRole.childTask,
                      ),
              ),
            ),
          ),
          const shad.Gap(8),
          _SelectionFieldButton(
            label: context.l10n.taskBoardDetailAddChildTask,
            value: context.l10n.taskBoardDetailSelectTask,
            enabled: !_isRelationshipBusy,
            onPressed: () => _pickTaskRelationshipForDetail(
              role: _TaskRelationshipRole.childTask,
            ),
          ),
        ],
      ),
      const shad.Gap(10),
      _RelationshipSectionCard(
        title: context.l10n.taskBoardDetailBlockedBy,
        icon: _taskRelationshipIcon(_TaskRelationshipKind.blockedBy),
        children: [
          if (relationships.blockedBy.isEmpty)
            Text(
              context.l10n.taskBoardDetailNone,
              style: shad.Theme.of(context).typography.small,
            ),
          ...relationships.blockedBy.map(
            (task) => Padding(
              padding: const EdgeInsets.only(top: 8),
              child: _RelationshipTaskTile(
                task: task,
                onNavigate: () => _navigateToLinkedTask(task),
                onRemove: _isRelationshipBusy
                    ? null
                    : () => _removeTaskRelationshipFromDetail(
                        task,
                        role: _TaskRelationshipRole.blockedBy,
                      ),
              ),
            ),
          ),
          const shad.Gap(8),
          _SelectionFieldButton(
            label: context.l10n.taskBoardDetailAddBlockedByTask,
            value: context.l10n.taskBoardDetailSelectTask,
            enabled: !_isRelationshipBusy,
            onPressed: () => _pickTaskRelationshipForDetail(
              role: _TaskRelationshipRole.blockedBy,
            ),
          ),
        ],
      ),
      const shad.Gap(10),
      _RelationshipSectionCard(
        title: context.l10n.taskBoardDetailBlocking,
        icon: _taskRelationshipIcon(_TaskRelationshipKind.blocking),
        children: [
          if (relationships.blocking.isEmpty)
            Text(
              context.l10n.taskBoardDetailNone,
              style: shad.Theme.of(context).typography.small,
            ),
          ...relationships.blocking.map(
            (task) => Padding(
              padding: const EdgeInsets.only(top: 8),
              child: _RelationshipTaskTile(
                task: task,
                onNavigate: () => _navigateToLinkedTask(task),
                onRemove: _isRelationshipBusy
                    ? null
                    : () => _removeTaskRelationshipFromDetail(
                        task,
                        role: _TaskRelationshipRole.blocking,
                      ),
              ),
            ),
          ),
          const shad.Gap(8),
          _SelectionFieldButton(
            label: context.l10n.taskBoardDetailAddBlockingTask,
            value: context.l10n.taskBoardDetailSelectTask,
            enabled: !_isRelationshipBusy,
            onPressed: () => _pickTaskRelationshipForDetail(
              role: _TaskRelationshipRole.blocking,
            ),
          ),
        ],
      ),
      const shad.Gap(10),
      _RelationshipSectionCard(
        title: context.l10n.taskBoardDetailRelatedTasks,
        icon: _taskRelationshipIcon(_TaskRelationshipKind.related),
        children: [
          if (relationships.relatedTasks.isEmpty)
            Text(
              context.l10n.taskBoardDetailNone,
              style: shad.Theme.of(context).typography.small,
            ),
          ...relationships.relatedTasks.map(
            (task) => Padding(
              padding: const EdgeInsets.only(top: 8),
              child: _RelationshipTaskTile(
                task: task,
                onNavigate: () => _navigateToLinkedTask(task),
                onRemove: _isRelationshipBusy
                    ? null
                    : () => _removeTaskRelationshipFromDetail(
                        task,
                        role: _TaskRelationshipRole.relatedTask,
                      ),
              ),
            ),
          ),
          const shad.Gap(8),
          _SelectionFieldButton(
            label: context.l10n.taskBoardDetailAddRelatedTask,
            value: context.l10n.taskBoardDetailSelectTask,
            enabled: !_isRelationshipBusy,
            onPressed: () => _pickTaskRelationshipForDetail(
              role: _TaskRelationshipRole.relatedTask,
            ),
          ),
        ],
      ),
    ];
  }

  Future<void> _pickTaskRelationshipForDetail({
    required _TaskRelationshipRole role,
  }) async {
    if (_relationshipTaskOptions.isEmpty) {
      final fallbackErrorMessage = context.l10n.commonSomethingWentWrong;
      try {
        await _loadRelationshipTaskOptionsForDetail();
      } on ApiException catch (error) {
        if (!mounted) return;
        _showRelationshipErrorToast(
          error.message.trim().isEmpty ? fallbackErrorMessage : error.message,
        );
        return;
      } on Exception {
        if (!mounted) return;
        _showRelationshipErrorToast(fallbackErrorMessage);
        return;
      }
    }

    if (!mounted) return;

    final blockedIds = _blockedRelationshipTaskIdsForDetail(role: role);
    final options = _relationshipTaskOptions
        .where((option) => !blockedIds.contains(option.id))
        .toList(growable: false);

    if (options.isEmpty) {
      _showRelationshipErrorToast(
        context.l10n.taskBoardDetailNoAvailableRelationshipTasks,
      );
      return;
    }

    final selectedTaskId = await shad.showDialog<String>(
      context: context,
      builder: (context) => _TaskRelationshipPickerDialog(
        title: _relationshipPickerTitle(context, role),
        tasks: options,
      ),
    );

    if (selectedTaskId == null || !mounted) return;

    await _createTaskRelationshipForDetail(
      selectedTaskId: selectedTaskId,
      role: role,
    );
  }

  Future<void> _loadRelationshipTaskOptionsForDetail() async {
    final options = await context
        .read<TaskBoardDetailCubit>()
        .getRelationshipTaskOptions();
    if (!mounted) return;

    setState(() {
      _relationshipTaskOptions = options
          .where((option) => option.id != _task.id)
          .toList(growable: false);
    });
  }

  Set<String> _blockedRelationshipTaskIdsForDetail({
    required _TaskRelationshipRole role,
  }) {
    final relationships = _task.relationships;
    return switch (role) {
      _TaskRelationshipRole.parentTask => {
        if (relationships.parentTask != null) relationships.parentTask!.id,
      },
      _TaskRelationshipRole.childTask => {
        for (final task in relationships.childTasks) task.id,
      },
      _TaskRelationshipRole.blockedBy => {
        for (final task in relationships.blockedBy) task.id,
      },
      _TaskRelationshipRole.blocking => {
        for (final task in relationships.blocking) task.id,
      },
      _TaskRelationshipRole.relatedTask => {
        for (final task in relationships.relatedTasks) task.id,
      },
    };
  }

  Future<void> _createTaskRelationshipForDetail({
    required String selectedTaskId,
    required _TaskRelationshipRole role,
  }) async {
    final relation = _relationshipMutation(
      currentTaskId: _task.id,
      selectedTaskId: selectedTaskId,
      role: role,
    );

    final fallbackErrorMessage = context.l10n.commonSomethingWentWrong;
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final previousRelationships = _task.relationships;

    final selectedOption = _relationshipTaskOptions
        .where((option) => option.id == selectedTaskId)
        .cast<TaskLinkOption?>()
        .firstWhere((option) => option != null, orElse: () => null);

    final optimisticTask = selectedOption == null
        ? null
        : RelatedTaskInfo(
            id: selectedOption.id,
            name: selectedOption.name,
            displayNumber: selectedOption.displayNumber,
            completed: selectedOption.completed,
            priority: selectedOption.priority,
            boardName: selectedOption.boardName,
          );

    setState(() {
      _isMutatingRelationships = true;
      _relationshipsError = null;
      if (optimisticTask != null) {
        _task = _task.copyWith(
          relationships: _optimisticAddRelationship(
            _task.relationships,
            task: optimisticTask,
            role: role,
          ),
        );
      }
    });

    try {
      await context.read<TaskBoardDetailCubit>().createTaskRelationship(
        taskId: _task.id,
        sourceTaskId: relation.sourceTaskId,
        targetTaskId: relation.targetTaskId,
        type: relation.type,
      );
      await _loadRelationships();

      if (!mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert(
          content: Text(context.l10n.taskBoardDetailRelationshipAdded),
        ),
      );
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _task = _task.copyWith(relationships: previousRelationships);
        });
      }
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
      if (mounted) {
        setState(() {
          _task = _task.copyWith(relationships: previousRelationships);
        });
      }
      if (!mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) =>
            shad.Alert.destructive(content: Text(fallbackErrorMessage)),
      );
    } finally {
      if (mounted) {
        setState(() => _isMutatingRelationships = false);
      }
    }
  }

  Future<void> _removeTaskRelationshipFromDetail(
    RelatedTaskInfo targetTask, {
    required _TaskRelationshipRole role,
  }) async {
    final relation = _relationshipMutation(
      currentTaskId: _task.id,
      selectedTaskId: targetTask.id,
      role: role,
    );

    final fallbackErrorMessage = context.l10n.commonSomethingWentWrong;
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final previousRelationships = _task.relationships;

    setState(() {
      _isMutatingRelationships = true;
      _relationshipsError = null;
      _task = _task.copyWith(
        relationships: _optimisticRemoveRelationship(
          _task.relationships,
          taskId: targetTask.id,
          role: role,
        ),
      );
    });

    try {
      await context.read<TaskBoardDetailCubit>().deleteTaskRelationship(
        taskId: _task.id,
        sourceTaskId: relation.sourceTaskId,
        targetTaskId: relation.targetTaskId,
        type: relation.type,
      );
      await _loadRelationships();

      if (!mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert(
          content: Text(context.l10n.taskBoardDetailRelationshipRemoved),
        ),
      );
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _task = _task.copyWith(relationships: previousRelationships);
        });
      }
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
      if (mounted) {
        setState(() {
          _task = _task.copyWith(relationships: previousRelationships);
        });
      }
      if (!mounted || !toastContext.mounted) return;
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) =>
            shad.Alert.destructive(content: Text(fallbackErrorMessage)),
      );
    } finally {
      if (mounted) {
        setState(() => _isMutatingRelationships = false);
      }
    }
  }

  void _showRelationshipErrorToast(String message) {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (!toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) =>
          shad.Alert.destructive(content: Text(message)),
    );
  }

  void _navigateToLinkedTask(RelatedTaskInfo linkedTask) {
    final linkedBoardId = linkedTask.boardId?.trim();
    final targetBoardId = linkedBoardId?.isNotEmpty == true
        ? linkedBoardId!
        : widget.board.id;
    GoRouter.of(
      context,
    ).go(Routes.taskBoardTaskDetailPath(targetBoardId, linkedTask.id));
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

  Future<void> _deleteTask() async {
    final toastContext = Navigator.of(context, rootNavigator: true).context;

    final deleted =
        await shad.showDialog<bool>(
          context: context,
          builder: (_) => AsyncDeleteConfirmationDialog(
            title: context.l10n.taskBoardDetailDeleteTaskTitle,
            message: context.l10n.taskBoardDetailDeleteTaskDescription,
            cancelLabel: context.l10n.commonCancel,
            confirmLabel: context.l10n.taskBoardDetailDeleteTask,
            toastContext: toastContext,
            onConfirm: () async {
              await context.read<TaskBoardDetailCubit>().deleteTask(
                taskId: _task.id,
              );
            },
          ),
        ) ??
        false;

    if (!deleted || !mounted) return;

    if (!toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => shad.Alert(
        content: Text(context.l10n.taskBoardDetailTaskDeleted),
      ),
    );

    await shad.closeOverlay<void>(context);
  }
}
