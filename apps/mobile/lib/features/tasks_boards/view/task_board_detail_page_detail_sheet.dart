// ignore_for_file: deprecated_member_use, reason: flutter_markdown currently
// requires imageBuilder here to provide authenticated image requests.

part of 'task_board_detail_page.dart';

class _TaskBoardTaskDetailSheet extends StatefulWidget {
  const _TaskBoardTaskDetailSheet({
    required this.task,
    required this.board,
    required this.lists,
    required this.labels,
    required this.members,
    required this.projects,
  });

  final TaskBoardTask task;
  final TaskBoardDetail board;
  final List<TaskBoardList> lists;
  final List<TaskLabel> labels;
  final List<WorkspaceUserOption> members;
  final List<TaskProjectSummary> projects;

  @override
  State<_TaskBoardTaskDetailSheet> createState() =>
      _TaskBoardTaskDetailSheetState();
}

class _TaskBoardTaskDetailSheetState extends State<_TaskBoardTaskDetailSheet> {
  static const int _detailsTabIndex = 0;

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
        padding: EdgeInsets.fromLTRB(
          16,
          12,
          16,
          24 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
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
      await shad.closeOverlay<void>(context);
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
      ),
    );

    if (context.isCompact) {
      await shad.openDrawer<void>(
        context: context,
        position: shad.OverlayPosition.bottom,
        builder: (_) => content,
      );
    } else {
      await shad.showDialog<void>(
        context: context,
        builder: (_) => Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: content,
          ),
        ),
      );
    }

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

class _TaskBoardDescriptionAccordion extends StatelessWidget {
  const _TaskBoardDescriptionAccordion({
    required this.label,
    required this.description,
    required this.isExpanded,
    required this.onToggle,
  });

  final String label;
  final ParsedTipTapDescription description;
  final bool isExpanded;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        border: Border.all(color: theme.colorScheme.border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Material(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(10),
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: onToggle,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        label,
                        style: theme.typography.small.copyWith(
                          color: theme.colorScheme.mutedForeground,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Icon(
                      isExpanded ? Icons.expand_less : Icons.expand_more,
                      size: 18,
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ],
                ),
              ),
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeInOut,
            child: isExpanded
                ? Padding(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxHeight: 220),
                          child: Scrollbar(
                            thumbVisibility: true,
                            child: SingleChildScrollView(
                              child: _buildDescriptionMarkdown(context, theme),
                            ),
                          ),
                        ),
                        const shad.Gap(8),
                        Align(
                          alignment: Alignment.centerRight,
                          child: Tooltip(
                            message: label,
                            child: shad.IconButton.ghost(
                              onPressed: onToggle,
                              icon: Icon(
                                Icons.expand_less,
                                size: 16,
                                color: theme.colorScheme.mutedForeground,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }

  Widget _buildDescriptionMarkdown(BuildContext context, shad.ThemeData theme) {
    final styleSheet = _taskDescriptionMarkdownStyle(context, theme);

    return MarkdownBody(
      data: description.markdown,
      selectable: true,
      styleSheet: styleSheet,
      inlineSyntaxes: [_TaskDescriptionMentionInlineSyntax()],
      builders: {
        'mention-chip': _TaskDescriptionMentionChipBuilder(
          description.mentions,
        ),
      },
      imageBuilder: (uri, title, alt) {
        final source = uri.toString();
        final resolved = _resolveImageUrl(source);

        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: AspectRatio(
              aspectRatio: 16 / 9,
              child: Image.network(
                resolved,
                fit: BoxFit.cover,
                headers: _imageRequestHeaders(),
                errorBuilder: (_, error, stackTrace) => _buildImageFallback(
                  context,
                  alt: alt,
                ),
                loadingBuilder: (context, child, progress) {
                  if (progress == null) return child;
                  return Container(
                    color: theme.colorScheme.secondary.withValues(alpha: 0.4),
                    alignment: Alignment.center,
                    child: const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  );
                },
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildImageFallback(BuildContext context, {String? alt}) {
    final theme = shad.Theme.of(context);
    final label = alt?.trim().isNotEmpty == true ? alt!.trim() : 'Image';

    return Container(
      color: theme.colorScheme.secondary.withValues(alpha: 0.4),
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Text(
        label,
        style: theme.typography.small.copyWith(
          color: theme.colorScheme.mutedForeground,
        ),
        textAlign: TextAlign.center,
      ),
    );
  }

  String _resolveImageUrl(String value) {
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }

    if (value.startsWith('/')) {
      return '${ApiConfig.baseUrl}$value';
    }

    return value;
  }

  Map<String, String>? _imageRequestHeaders() {
    final token = supabase.auth.currentSession?.accessToken;
    if (token == null || token.isEmpty) {
      return null;
    }

    return {'Authorization': 'Bearer $token'};
  }
}

class _TaskDescriptionMentionInlineSyntax extends md.InlineSyntax {
  _TaskDescriptionMentionInlineSyntax()
    : super(r'@@mention:(\d+)@@', startCharacter: 64);

  @override
  bool onMatch(md.InlineParser parser, Match match) {
    final index = match.group(1);
    if (index == null) {
      return false;
    }

    final element = md.Element.empty('mention-chip');
    element.attributes['index'] = index;
    parser.addNode(element);
    return true;
  }
}

class _TaskDescriptionMentionChipBuilder extends MarkdownElementBuilder {
  _TaskDescriptionMentionChipBuilder(this.mentions);

  final List<TipTapMention> mentions;

  @override
  Widget? visitElementAfter(md.Element element, TextStyle? preferredStyle) {
    final indexString = element.attributes['index'];
    final index = int.tryParse(indexString ?? '');
    if (index == null || index < 0 || index >= mentions.length) {
      return Text('@mention', style: preferredStyle);
    }

    final mention = mentions[index];
    return Padding(
      padding: const EdgeInsets.only(right: 6, bottom: 4),
      child: _TaskDescriptionMentionChip(
        mention: mention,
        preferredStyle: preferredStyle,
      ),
    );
  }
}

class _TaskDescriptionMentionChip extends StatelessWidget {
  const _TaskDescriptionMentionChip({
    required this.mention,
    this.preferredStyle,
  });

  final TipTapMention mention;
  final TextStyle? preferredStyle;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final avatarUrl = mention.avatarUrl;
    final hasAvatar = avatarUrl != null && avatarUrl.trim().isNotEmpty;

    final tooltip = [
      if (mention.entityType != null) mention.entityType,
      if (mention.subtitle != null) mention.subtitle,
      if (mention.priority != null) mention.priority,
      if (mention.entityId != null) mention.entityId,
    ].whereType<String>().join(' | ');

    final chip = Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0x3313B96D),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0xFF13B96D)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 16,
            height: 16,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: const Color(0xFF13B96D), width: 0.8),
            ),
            child: ClipOval(
              child: hasAvatar
                  ? Image.network(
                      _resolveTaskDescriptionUrl(avatarUrl),
                      fit: BoxFit.cover,
                      headers: _taskDescriptionAuthHeaders(),
                      errorBuilder: (context, error, stackTrace) => const Icon(
                        Icons.person_outline,
                        size: 11,
                        color: Color(0xFF13B96D),
                      ),
                    )
                  : const Icon(
                      Icons.person_outline,
                      size: 11,
                      color: Color(0xFF13B96D),
                    ),
            ),
          ),
          const SizedBox(width: 5),
          Text(
            '@${mention.displayName}',
            style:
                preferredStyle?.copyWith(
                  color: const Color(0xFF4CE28C),
                  fontWeight: FontWeight.w600,
                ) ??
                theme.typography.small.copyWith(
                  color: const Color(0xFF4CE28C),
                  fontWeight: FontWeight.w600,
                ),
          ),
        ],
      ),
    );

    if (tooltip.isEmpty) {
      return chip;
    }

    return Tooltip(message: tooltip, child: chip);
  }
}

String _resolveTaskDescriptionUrl(String value) {
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }

  if (value.startsWith('/')) {
    return '${ApiConfig.baseUrl}$value';
  }

  return value;
}

Map<String, String>? _taskDescriptionAuthHeaders() {
  final token = supabase.auth.currentSession?.accessToken;
  if (token == null || token.isEmpty) {
    return null;
  }

  return {'Authorization': 'Bearer $token'};
}

MarkdownStyleSheet _taskDescriptionMarkdownStyle(
  BuildContext context,
  shad.ThemeData theme,
) {
  final materialTheme = Theme.of(context);

  return MarkdownStyleSheet.fromTheme(materialTheme).copyWith(
    p: theme.typography.base.copyWith(height: 1.5),
    h1: theme.typography.large.copyWith(fontWeight: FontWeight.w700),
    h2: theme.typography.large.copyWith(fontWeight: FontWeight.w600),
    h3: theme.typography.base.copyWith(fontWeight: FontWeight.w600),
    listBullet: theme.typography.base,
    blockquote: theme.typography.base.copyWith(
      color: theme.colorScheme.mutedForeground,
      fontStyle: FontStyle.italic,
      height: 1.45,
    ),
    blockquotePadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    blockquoteDecoration: BoxDecoration(
      color: theme.colorScheme.secondary.withValues(alpha: 0.25),
      borderRadius: BorderRadius.circular(10),
      border: Border.all(
        color: theme.colorScheme.border.withValues(alpha: 0.6),
      ),
    ),
    code: theme.typography.small.copyWith(
      fontFamily: 'monospace',
      backgroundColor: theme.colorScheme.secondary.withValues(alpha: 0.35),
    ),
    codeblockPadding: const EdgeInsets.all(10),
    codeblockDecoration: BoxDecoration(
      color: theme.colorScheme.secondary.withValues(alpha: 0.35),
      borderRadius: BorderRadius.circular(8),
      border: Border.all(
        color: theme.colorScheme.border.withValues(alpha: 0.65),
      ),
    ),
    tableBorder: TableBorder.all(color: theme.colorScheme.border),
    tableHead: theme.typography.small.copyWith(fontWeight: FontWeight.w600),
    tableBody: theme.typography.small,
    tableCellsPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
    horizontalRuleDecoration: BoxDecoration(
      border: Border(
        top: BorderSide(color: theme.colorScheme.border.withValues(alpha: 0.8)),
      ),
    ),
  );
}

class _TaskBoardTaskDetailRow extends StatelessWidget {
  const _TaskBoardTaskDetailRow({
    required this.label,
    this.value,
    this.child,
  });

  final String label;
  final String? value;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final resolvedChild =
        child ?? Text(value ?? '', style: theme.typography.base);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 116,
          child: Text(
            label,
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.mutedForeground,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const shad.Gap(10),
        Expanded(child: resolvedChild),
      ],
    );
  }
}

class _AssigneeChip extends StatelessWidget {
  const _AssigneeChip({
    required this.label,
    this.avatarUrl,
  });

  final String label;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    final hasAvatar = avatarUrl?.trim().isNotEmpty == true;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        border: Border.all(color: shad.Theme.of(context).colorScheme.border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircleAvatar(
            radius: 10,
            foregroundImage: hasAvatar ? NetworkImage(avatarUrl!.trim()) : null,
            child: hasAvatar
                ? null
                : Text(
                    label.isEmpty ? '?' : label.substring(0, 1).toUpperCase(),
                    style: const TextStyle(fontSize: 10),
                  ),
          ),
          const shad.Gap(6),
          Text(label, style: shad.Theme.of(context).typography.small),
        ],
      ),
    );
  }
}
