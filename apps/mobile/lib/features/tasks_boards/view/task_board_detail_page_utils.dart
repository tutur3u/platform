part of 'task_board_detail_page.dart';

List<TaskBoardList> _sortedLists(List<TaskBoardList> lists) {
  final sorted = [...lists]
    ..sort((a, b) {
      final aPosition = a.position ?? 0;
      final bPosition = b.position ?? 0;
      if (aPosition != bPosition) return aPosition.compareTo(bPosition);

      final aName = a.name?.toLowerCase() ?? '';
      final bName = b.name?.toLowerCase() ?? '';
      return aName.compareTo(bName);
    });
  return sorted;
}

class _TaskBoardListColorOption {
  const _TaskBoardListColorOption({
    required this.value,
    required this.label,
    required this.color,
    required this.surface,
  });

  final String value;
  final String label;
  final Color color;
  final Color surface;
}

class _TaskBoardListStatusOption {
  const _TaskBoardListStatusOption({
    required this.value,
    required this.label,
    required this.icon,
    required this.color,
  });

  final String value;
  final String label;
  final IconData icon;
  final Color color;
}

class _TaskBoardListVisualStyle {
  const _TaskBoardListVisualStyle({
    required this.accent,
    required this.surface,
    required this.surfaceBorder,
    required this.statusBadge,
    required this.statusIcon,
    required this.statusLabel,
  });

  final Color accent;
  final Color surface;
  final Color surfaceBorder;
  final StatusBadgeColors statusBadge;
  final IconData statusIcon;
  final String statusLabel;
}

List<_TaskBoardListColorOption> _taskBoardListColorOptions(
  BuildContext context,
) {
  return TaskBoardList.supportedColors
      .map(
        (color) => _TaskBoardListColorOption(
          value: color,
          label: _taskBoardListColorLabel(context, color),
          color: _taskBoardListColor(context, color),
          surface: _taskBoardListSurfaceColor(context, color),
        ),
      )
      .toList(growable: false);
}

List<_TaskBoardListStatusOption> _taskBoardListStatusOptions(
  BuildContext context,
) {
  return TaskBoardList.supportedStatuses
      .map(
        (status) => _TaskBoardListStatusOption(
          value: status,
          label: _taskBoardListStatusLabel(context, status),
          icon: _taskBoardListStatusIcon(status),
          color: _taskBoardListStatusBadgeColors(context, status).textColor,
        ),
      )
      .toList(growable: false);
}

_TaskBoardListVisualStyle _taskBoardListVisualStyle(
  BuildContext context,
  TaskBoardList list,
) {
  final normalizedColor =
      TaskBoardList.normalizeSupportedColor(list.color) ?? 'GRAY';
  final normalizedStatus =
      TaskBoardList.normalizeSupportedStatus(list.status) ?? 'active';
  final accent = _taskBoardListColor(context, normalizedColor);
  final surface = _taskBoardListSurfaceColor(context, normalizedColor);

  return _TaskBoardListVisualStyle(
    accent: accent,
    surface: surface,
    surfaceBorder: accent.withValues(alpha: 0.28),
    statusBadge: _taskBoardListStatusBadgeColors(context, normalizedStatus),
    statusIcon: _taskBoardListStatusIcon(normalizedStatus),
    statusLabel: _taskBoardListStatusLabel(context, normalizedStatus),
  );
}

String _taskBoardListStatusLabel(BuildContext context, String? status) {
  return switch (TaskBoardList.normalizeSupportedStatus(status) ?? 'active') {
    'documents' => context.l10n.taskBoardDetailStatusDocuments,
    'not_started' => context.l10n.taskBoardDetailStatusNotStarted,
    'active' => context.l10n.taskBoardDetailStatusActive,
    'done' => context.l10n.taskBoardDetailStatusDone,
    'closed' => context.l10n.taskBoardDetailStatusClosed,
    _ => context.l10n.taskBoardDetailStatusActive,
  };
}

String _taskBoardListColorLabel(BuildContext context, String? color) {
  return switch (TaskBoardList.normalizeSupportedColor(color) ?? 'GRAY') {
    'GRAY' => context.l10n.taskBoardDetailColorGray,
    'RED' => context.l10n.taskBoardDetailColorRed,
    'BLUE' => context.l10n.taskBoardDetailColorBlue,
    'GREEN' => context.l10n.taskBoardDetailColorGreen,
    'YELLOW' => context.l10n.taskBoardDetailColorYellow,
    'ORANGE' => context.l10n.taskBoardDetailColorOrange,
    'PURPLE' => context.l10n.taskBoardDetailColorPurple,
    'PINK' => context.l10n.taskBoardDetailColorPink,
    'INDIGO' => context.l10n.taskBoardDetailColorIndigo,
    'CYAN' => context.l10n.taskBoardDetailColorCyan,
    _ => context.l10n.taskBoardDetailColorGray,
  };
}

IconData _taskBoardListStatusIcon(String? status) {
  return switch (TaskBoardList.normalizeSupportedStatus(status) ?? 'active') {
    'documents' => Icons.description_outlined,
    'not_started' => Icons.radio_button_unchecked,
    'active' => Icons.circle,
    'done' => Icons.check_circle_outline,
    'closed' => Icons.cancel_outlined,
    _ => Icons.circle,
  };
}

Color _taskBoardListColor(BuildContext context, String? color) {
  final palette = context.dynamicColors;
  return switch (TaskBoardList.normalizeSupportedColor(color) ?? 'GRAY') {
    'GRAY' => palette.gray,
    'RED' => palette.red,
    'BLUE' => palette.blue,
    'GREEN' => palette.green,
    'YELLOW' => palette.yellow,
    'ORANGE' => palette.orange,
    'PURPLE' => palette.purple,
    'PINK' => palette.pink,
    'INDIGO' => palette.indigo,
    'CYAN' => palette.cyan,
    _ => palette.gray,
  };
}

Color _taskBoardListSurfaceColor(BuildContext context, String? color) {
  final palette = context.dynamicColors;
  return switch (TaskBoardList.normalizeSupportedColor(color) ?? 'GRAY') {
    'GRAY' => palette.calendarGray,
    'RED' => palette.calendarRed,
    'BLUE' => palette.calendarBlue,
    'GREEN' => palette.calendarGreen,
    'YELLOW' => palette.calendarYellow,
    'ORANGE' => palette.calendarOrange,
    'PURPLE' => palette.calendarPurple,
    'PINK' => palette.calendarPink,
    'INDIGO' => palette.calendarIndigo,
    'CYAN' => palette.calendarCyan,
    _ => palette.calendarGray,
  };
}

StatusBadgeColors _taskBoardListStatusBadgeColors(
  BuildContext context,
  String? status,
) {
  final palette = context.dynamicColors;

  return switch (TaskBoardList.normalizeSupportedStatus(status) ?? 'active') {
    'documents' => StatusBadgeColors(
      backgroundColor: palette.cyan.withValues(alpha: 0.12),
      borderColor: palette.cyan.withValues(alpha: 0.3),
      textColor: palette.cyan,
    ),
    'not_started' => StatusBadgeColors(
      backgroundColor: palette.gray.withValues(alpha: 0.12),
      borderColor: palette.gray.withValues(alpha: 0.28),
      textColor: palette.gray,
    ),
    'active' => StatusBadgeColors(
      backgroundColor: palette.blue.withValues(alpha: 0.12),
      borderColor: palette.blue.withValues(alpha: 0.28),
      textColor: palette.blue,
    ),
    'done' => StatusBadgeColors(
      backgroundColor: palette.green.withValues(alpha: 0.12),
      borderColor: palette.green.withValues(alpha: 0.28),
      textColor: palette.green,
    ),
    'closed' => StatusBadgeColors(
      backgroundColor: palette.purple.withValues(alpha: 0.12),
      borderColor: palette.purple.withValues(alpha: 0.28),
      textColor: palette.purple,
    ),
    _ => StatusBadgeColors(
      backgroundColor: palette.blue.withValues(alpha: 0.12),
      borderColor: palette.blue.withValues(alpha: 0.28),
      textColor: palette.blue,
    ),
  };
}

String _taskPriorityLabel(BuildContext context, String? priority) {
  return switch (priority) {
    'critical' => context.l10n.tasksPriorityCritical,
    'high' => context.l10n.tasksPriorityHigh,
    'low' => context.l10n.tasksPriorityLow,
    _ => context.l10n.tasksPriorityNormal,
  };
}

class _TaskPriorityStyle {
  const _TaskPriorityStyle({
    required this.label,
    required this.icon,
    required this.foreground,
    required this.background,
    required this.border,
  });

  final String label;
  final IconData icon;
  final Color foreground;
  final Color background;
  final Color border;
}

_TaskPriorityStyle _taskPriorityStyle(BuildContext context, String? priority) {
  final normalized = (priority ?? 'normal').trim().toLowerCase();
  final label = _taskPriorityLabel(context, normalized);

  return switch (normalized) {
    'critical' => _TaskPriorityStyle(
      label: label,
      icon: Icons.priority_high_rounded,
      foreground: const Color(0xFFB42318),
      background: const Color(0xFFFEE4E2),
      border: const Color(0xFFFDA29B),
    ),
    'high' => _TaskPriorityStyle(
      label: label,
      icon: Icons.keyboard_double_arrow_up_rounded,
      foreground: const Color(0xFFB54708),
      background: const Color(0xFFFFF6ED),
      border: const Color(0xFFFCC17A),
    ),
    'low' => _TaskPriorityStyle(
      label: label,
      icon: Icons.keyboard_double_arrow_down_rounded,
      foreground: const Color(0xFF175CD3),
      background: const Color(0xFFEFF8FF),
      border: const Color(0xFF84CAFF),
    ),
    _ => _TaskPriorityStyle(
      label: label,
      icon: Icons.remove_rounded,
      foreground: const Color(0xFFB54708),
      background: const Color(0xFFFFFAEB),
      border: const Color(0xFFFEC84B),
    ),
  };
}

String? _taskDescriptionPreview(String? rawDescription) {
  final trimmed = rawDescription?.trim();
  if (trimmed == null || trimmed.isEmpty) return null;

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return trimmed;
  }

  try {
    final decoded = jsonDecode(trimmed);
    final segments = <String>[];

    void walk(Object? value) {
      if (value is Map<String, dynamic>) {
        final text = value['text'];
        if (text is String && text.trim().isNotEmpty) {
          segments.add(text.trim());
        }

        final content = value['content'];
        if (content is List) {
          content.forEach(walk);
        }
        return;
      }

      if (value is List) {
        value.forEach(walk);
      }
    }

    walk(decoded);
    if (segments.isEmpty) return trimmed;
    return segments.join(' ');
  } on Object {
    return trimmed;
  }
}

bool _taskHasDescription(String? rawDescription) {
  return _taskDescriptionPreview(rawDescription) != null;
}

String _taskReference(TaskBoardTask task, TaskBoardDetail board) {
  final displayNumber = task.displayNumber;
  if (displayNumber != null) {
    final prefix = board.ticketPrefix?.trim();
    final effectivePrefix = (prefix != null && prefix.isNotEmpty)
        ? prefix
        : 'TASK';
    return '${effectivePrefix.toUpperCase()}-$displayNumber';
  }

  final id = task.id.trim();
  if (id.isEmpty) return 'TASK';
  if (id.length <= 8) return id.toUpperCase();
  return id.substring(0, 8).toUpperCase();
}

String _taskSmartDate(BuildContext context, DateTime date) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final target = DateTime(date.year, date.month, date.day);
  final diff = target.difference(today).inDays;

  if (diff == 0) return context.l10n.taskBoardDetailToday;
  if (diff == 1) return context.l10n.taskBoardDetailTomorrow;
  if (diff == -1) return context.l10n.taskBoardDetailYesterday;
  if (diff > 1) {
    return context.l10n.taskBoardDetailInDays(diff);
  }
  // past
  return context.l10n.taskBoardDetailDaysAgo(diff.abs());
}

String? _taskDueLabel(BuildContext context, TaskBoardTask task) {
  if (task.endDate == null) return null;
  final date = _taskSmartDate(context, task.endDate!);
  return context.l10n.taskBoardDetailDueAt(date);
}

String? _taskStartLabel(BuildContext context, TaskBoardTask task) {
  if (task.startDate == null) return null;
  final now = DateTime.now();
  // Only show "Starts X" if the start date is in the future
  if (!task.startDate!.isAfter(now)) return null;
  final date = _taskSmartDate(context, task.startDate!);
  return context.l10n.taskBoardDetailStartsAt(date);
}

bool _taskIsOverdue(TaskBoardTask task) {
  if (task.endDate == null) return false;
  final dueDate = DateTime(
    task.endDate!.year,
    task.endDate!.month,
    task.endDate!.day,
  );
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  return dueDate.isBefore(today);
}

bool _hasChips(
  String? estimationLabel,
  TaskBoardTask task, {
  required bool hasDescription,
}) {
  return task.priority != null ||
      estimationLabel != null ||
      task.projects.isNotEmpty ||
      task.labels.isNotEmpty ||
      hasDescription;
}

List<int> _taskEstimationOptions(TaskBoardDetail board) {
  final estimationType = board.estimationType?.trim();
  if (estimationType == null || estimationType.isEmpty) {
    return List<int>.generate(9, (index) => index);
  }

  final max = board.extendedEstimation ? 7 : 5;
  final values = List<int>.generate(max + 1, (index) => index);
  if (!board.allowZeroEstimates) {
    return values.where((value) => value != 0).toList(growable: false);
  }
  return values;
}

String? _taskEstimationLabel(TaskBoardTask task, TaskBoardDetail board) {
  final points = task.estimationPoints;
  if (points == null) return null;
  return _taskEstimationPointLabel(points: points, board: board);
}

String _taskEstimationPointLabel({
  required int points,
  required TaskBoardDetail board,
}) {
  final estimationType = board.estimationType?.trim().toLowerCase();

  switch (estimationType) {
    case 't-shirt':
      return switch (points) {
        0 => '-',
        1 => 'XS',
        2 => 'S',
        3 => 'M',
        4 => 'L',
        5 => 'XL',
        6 => 'XXL',
        7 => 'XXXL',
        _ => points.toString(),
      };
    case 'fibonacci':
      return switch (points) {
        0 => '0',
        1 => '1',
        2 => '2',
        3 => '3',
        4 => '5',
        5 => '8',
        6 => '13',
        7 => '21',
        _ => points.toString(),
      };
    case 'exponential':
      return switch (points) {
        0 => '0',
        1 => '1',
        2 => '2',
        3 => '4',
        4 => '8',
        5 => '16',
        6 => '32',
        7 => '64',
        _ => points.toString(),
      };
    default:
      return points.toString();
  }
}

String _taskProjectLabel(TaskBoardTaskProject project) {
  final name = project.name?.trim();
  if (name != null && name.isNotEmpty) {
    return name;
  }
  return project.id;
}

String? _taskLabelName(TaskBoardTaskLabel label) {
  final name = label.name?.trim();
  if (name != null && name.isNotEmpty) {
    return name;
  }
  final id = label.id.trim();
  if (id.isEmpty) return null;
  return id;
}
