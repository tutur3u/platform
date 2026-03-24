import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/data/models/task_link_option.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Future<void> showTaskLinkPickerSheet({
  required BuildContext context,
  required TaskRepository taskRepository,
  required String wsId,
  required String? selectedTaskId,
  required ValueChanged<TaskLinkOption?> onSelected,
}) async {
  showAdaptiveDrawer(
    context: context,
    builder: (_) => TaskLinkPickerSheet(
      hostContext: context,
      taskRepository: taskRepository,
      wsId: wsId,
      selectedTaskId: selectedTaskId,
      onSelected: onSelected,
    ),
  );
}

class TaskLinkPickerSheet extends StatefulWidget {
  const TaskLinkPickerSheet({
    required this.hostContext,
    required this.taskRepository,
    required this.wsId,
    required this.selectedTaskId,
    required this.onSelected,
    super.key,
  });

  final BuildContext hostContext;
  final TaskRepository taskRepository;
  final String wsId;
  final String? selectedTaskId;
  final ValueChanged<TaskLinkOption?> onSelected;

  @override
  State<TaskLinkPickerSheet> createState() => _TaskLinkPickerSheetState();
}

class _TaskLinkPickerSheetState extends State<TaskLinkPickerSheet> {
  static const int _pageSize = 20;
  static const Duration _searchDebounce = Duration(milliseconds: 300);

  final ScrollController _scrollController = ScrollController();
  final TextEditingController _searchController = TextEditingController();
  Timer? _searchDebounceTimer;

  final List<TaskLinkOption> _tasks = <TaskLinkOption>[];
  bool _assignedToMeOnly = true;
  bool _isLoadingInitial = false;
  bool _isLoadingMore = false;
  bool _hasMore = true;
  int _offset = 0;
  int _totalCount = 0;
  int _requestVersion = 0;
  String _searchQuery = '';
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    unawaited(_loadInitial());
  }

  @override
  void dispose() {
    _searchDebounceTimer?.cancel();
    _searchController.dispose();
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients || _isLoadingMore || !_hasMore) {
      return;
    }
    final position = _scrollController.position;
    if (position.pixels >= position.maxScrollExtent - 220) {
      unawaited(_loadMore());
    }
  }

  Future<void> _closeSheet(BuildContext context) async {
    if (context.isCompact) {
      await shad.closeOverlay<void>(context);
      return;
    }

    await Navigator.maybePop(context);
  }

  Future<void> _selectTask(BuildContext context, TaskLinkOption? task) async {
    widget.onSelected(task);
    await _closeSheet(context);
  }

  Future<void> _loadInitial() async {
    final requestId = ++_requestVersion;
    setState(() {
      _isLoadingInitial = true;
      _isLoadingMore = false;
      _errorMessage = null;
      _offset = 0;
      _totalCount = 0;
      _hasMore = true;
      _tasks.clear();
    });

    try {
      final result = await widget.taskRepository.getTimeTrackingTaskLinkOptions(
        widget.wsId,
        limit: _pageSize,
        offset: 0,
        assignedToMe: _assignedToMeOnly,
        searchQuery: _searchQuery,
      );

      if (!mounted || requestId != _requestVersion) {
        return;
      }

      final loadedTasks = result.tasks;
      final totalCount = result.totalCount;
      setState(() {
        _tasks
          ..clear()
          ..addAll(loadedTasks);
        _offset = loadedTasks.length;
        _totalCount = totalCount;
        _hasMore = _offset < totalCount;
        _isLoadingInitial = false;
      });
    } on ApiException catch (error) {
      if (!mounted || requestId != _requestVersion) {
        return;
      }
      final message = error.message.trim();
      setState(() {
        _isLoadingInitial = false;
        _errorMessage = message.isNotEmpty
            ? message
            : context.l10n.commonSomethingWentWrong;
      });
    } on Exception {
      if (!mounted || requestId != _requestVersion) {
        return;
      }
      setState(() {
        _isLoadingInitial = false;
        _errorMessage = context.l10n.commonSomethingWentWrong;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_isLoadingInitial || _isLoadingMore || !_hasMore) {
      return;
    }

    final requestId = _requestVersion;
    setState(() => _isLoadingMore = true);

    try {
      final result = await widget.taskRepository.getTimeTrackingTaskLinkOptions(
        widget.wsId,
        limit: _pageSize,
        offset: _offset,
        assignedToMe: _assignedToMeOnly,
        searchQuery: _searchQuery,
      );

      if (!mounted || requestId != _requestVersion) {
        return;
      }

      final loadedTasks = result.tasks;
      final totalCount = result.totalCount;
      setState(() {
        _tasks.addAll(loadedTasks);
        _offset += loadedTasks.length;
        _totalCount = totalCount;
        _hasMore = _offset < totalCount;
        _isLoadingMore = false;
      });
    } on Exception {
      if (!mounted || requestId != _requestVersion) {
        return;
      }
      setState(() => _isLoadingMore = false);
    }
  }

  void _onSearchChanged(String value) {
    _searchDebounceTimer?.cancel();
    _searchDebounceTimer = Timer(_searchDebounce, () {
      if (!mounted) {
        return;
      }
      final normalized = value.trim();
      if (normalized == _searchQuery) {
        return;
      }
      _searchQuery = normalized;
      unawaited(_loadInitial());
    });
  }

  void _toggleQuickFilter(bool assignedToMe) {
    if (_assignedToMeOnly == assignedToMe) {
      return;
    }

    setState(() => _assignedToMeOnly = assignedToMe);
    unawaited(_loadInitial());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final screenH = MediaQuery.sizeOf(context).height;

    return SafeArea(
      child: LayoutBuilder(
        builder: (context, constraints) {
          // Bottom drawers pass a finite max height; unbounded would overflow
          // when combining fixed chrome + min list height + footer.
          final sheetMaxH = constraints.hasBoundedHeight
              ? constraints.maxHeight
              : screenH * 0.92;

          return ConstrainedBox(
            constraints: BoxConstraints(maxHeight: sheetMaxH),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Phone: shad.openDrawer already paints a drag handle.
                // Dialog: show one.
                if (!context.isCompact)
                  Padding(
                    padding: const EdgeInsets.only(top: 8, bottom: 4),
                    child: Center(
                      child: Container(
                        width: 36,
                        height: 4,
                        decoration: BoxDecoration(
                          color: colorScheme.border,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 12,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          l10n.timerLinkTask,
                          style: theme.typography.h4,
                        ),
                      ),
                      shad.IconButton.ghost(
                        icon: const Icon(shad.LucideIcons.x, size: 18),
                        onPressed: () => unawaited(_closeSheet(context)),
                      ),
                    ],
                  ),
                ),
                const shad.Divider(),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: shad.TextField(
                    controller: _searchController,
                    hintText: l10n.timerTaskPickerSearch,
                    onChanged: _onSearchChanged,
                    features: const [
                      shad.InputFeature.leading(Icon(Icons.search, size: 18)),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
                  child: Row(
                    children: [
                      _QuickFilterChip(
                        label: l10n.timerTaskPickerAssignedToMe,
                        selected: _assignedToMeOnly,
                        onTap: () => _toggleQuickFilter(true),
                      ),
                      const shad.Gap(8),
                      _QuickFilterChip(
                        label: l10n.timerTaskPickerAllTasks,
                        selected: !_assignedToMeOnly,
                        onTap: () => _toggleQuickFilter(false),
                      ),
                      const Spacer(),
                      if (_isLoadingInitial)
                        const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      else
                        Text(
                          l10n.timerTaskPickerResultCount(_totalCount),
                          style: theme.typography.xSmall.copyWith(
                            color: colorScheme.mutedForeground,
                          ),
                        ),
                    ],
                  ),
                ),
                Expanded(
                  child: _buildTaskList(context),
                ),
                const shad.Divider(),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      shad.OutlineButton(
                        onPressed: () => unawaited(_selectTask(context, null)),
                        child: Text(l10n.timerTaskPickerNoTask),
                      ),
                      const shad.Gap(8),
                      shad.GhostButton(
                        onPressed: () => unawaited(_closeSheet(context)),
                        child: Text(l10n.commonCancel),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildTaskList(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    if (_isLoadingInitial && _tasks.isEmpty) {
      return const Center(child: shad.CircularProgressIndicator());
    }

    if (_errorMessage != null && _tasks.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.error_outline,
                size: 24,
                color: theme.colorScheme.destructive,
              ),
              const shad.Gap(8),
              Text(
                _errorMessage ?? l10n.commonSomethingWentWrong,
                textAlign: TextAlign.center,
              ),
              const shad.Gap(10),
              shad.SecondaryButton(
                onPressed: () => unawaited(_loadInitial()),
                child: Text(l10n.commonRetry),
              ),
            ],
          ),
        ),
      );
    }

    if (_tasks.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Text(
            l10n.timerTaskPickerNoMatchingTasks,
            textAlign: TextAlign.center,
            style: theme.typography.textMuted,
          ),
        ),
      );
    }

    final itemCount = _tasks.length + (_isLoadingMore ? 1 : 0);
    return ListView.separated(
      controller: _scrollController,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      itemCount: itemCount,
      separatorBuilder: (_, _) => const shad.Gap(8),
      itemBuilder: (context, index) {
        if (index >= _tasks.length) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: Center(
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          );
        }

        final task = _tasks[index];
        final selected = task.id == widget.selectedTaskId;
        return _TaskOptionCard(
          task: task,
          selected: selected,
          onTap: () => unawaited(_selectTask(context, task)),
        );
      },
    );
  }
}

class _QuickFilterChip extends StatelessWidget {
  const _QuickFilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: selected
                ? colorScheme.primary.withValues(alpha: 0.12)
                : colorScheme.secondary.withValues(alpha: 0.5),
            border: Border.all(
              color: selected ? colorScheme.primary : colorScheme.border,
            ),
          ),
          child: Text(
            label,
            style: theme.typography.xSmall.copyWith(
              fontWeight: FontWeight.w600,
              color: selected ? colorScheme.primary : colorScheme.foreground,
            ),
          ),
        ),
      ),
    );
  }
}

class _TaskOptionCard extends StatelessWidget {
  const _TaskOptionCard({
    required this.task,
    required this.selected,
    required this.onTap,
  });

  final TaskLinkOption task;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final priorityText = _priorityLabel(l10n, task.priority);
    final timeHint = _timeHint(task, l10n);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? colorScheme.primary : colorScheme.border,
              width: selected ? 1.2 : 1,
            ),
            color: selected
                ? colorScheme.primary.withValues(alpha: 0.08)
                : colorScheme.card,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      task.name.trim().isEmpty
                          ? l10n.taskBoardDetailUntitledTask
                          : task.name.trim(),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const shad.Gap(10),
                  if (selected)
                    Icon(
                      Icons.check_circle,
                      size: 18,
                      color: colorScheme.primary,
                    )
                  else
                    Icon(
                      Icons.radio_button_unchecked,
                      size: 18,
                      color: colorScheme.mutedForeground,
                    ),
                ],
              ),
              const shad.Gap(6),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  if (task.ticketLabel != null)
                    _metaPill(
                      context,
                      icon: Icons.confirmation_number_outlined,
                      label: task.ticketLabel!,
                    ),
                  if (task.boardName?.trim().isNotEmpty == true)
                    _metaPill(
                      context,
                      icon: Icons.dashboard_outlined,
                      label: task.boardName!.trim(),
                    ),
                  if (task.listName?.trim().isNotEmpty == true)
                    _metaPill(
                      context,
                      icon: Icons.view_kanban_outlined,
                      label: task.listName!.trim(),
                    ),
                ],
              ),
              const shad.Gap(8),
              Row(
                children: [
                  if (priorityText != null)
                    _metaCaption(
                      context,
                      icon: Icons.flag_outlined,
                      text: priorityText,
                    ),
                  if (priorityText != null && timeHint != null)
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 8),
                      child: Text('•'),
                    ),
                  if (timeHint != null)
                    _metaCaption(
                      context,
                      icon: Icons.schedule_outlined,
                      text: timeHint,
                    ),
                  const Spacer(),
                  _metaCaption(
                    context,
                    icon: Icons.group_outlined,
                    text: l10n.timerTaskPickerAssignees(task.assigneeCount),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  static Widget _metaPill(
    BuildContext context, {
    required IconData icon,
    required String label,
  }) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: colorScheme.secondary.withValues(alpha: 0.6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: colorScheme.mutedForeground),
          const shad.Gap(4),
          Text(
            label,
            style: theme.typography.xSmall.copyWith(
              color: colorScheme.mutedForeground,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  static Widget _metaCaption(
    BuildContext context, {
    required IconData icon,
    required String text,
  }) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 12, color: colorScheme.mutedForeground),
        const shad.Gap(3),
        Text(
          text,
          style: theme.typography.xSmall.copyWith(
            color: colorScheme.mutedForeground,
          ),
        ),
      ],
    );
  }

  static String? _priorityLabel(AppLocalizations l10n, String? priority) {
    return switch (priority?.toLowerCase().trim()) {
      'critical' => l10n.tasksPriorityCritical,
      'high' => l10n.tasksPriorityHigh,
      'normal' => l10n.tasksPriorityNormal,
      'low' => l10n.tasksPriorityLow,
      _ => null,
    };
  }

  static String? _timeHint(TaskLinkOption task, AppLocalizations l10n) {
    final endDate = task.endDate;
    if (endDate != null) {
      return l10n.taskBoardDetailDueAt(_formatDate(endDate));
    }
    final startDate = task.startDate;
    if (startDate != null) {
      return l10n.taskBoardDetailStartsAt(_formatDate(startDate));
    }
    return null;
  }

  static String _formatDate(DateTime date) {
    final local = date.toLocal();
    final month = local.month.toString().padLeft(2, '0');
    final day = local.day.toString().padLeft(2, '0');
    return '$month/$day';
  }
}
