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

String _taskDatesLabel(TaskBoardTask task) {
  final formatter = DateFormat.yMd();
  if (task.startDate == null && task.endDate == null) return '';
  if (task.startDate != null && task.endDate != null) {
    return '${formatter.format(task.startDate!)} '
        '- ${formatter.format(task.endDate!)}';
  }
  if (task.startDate != null) {
    return formatter.format(task.startDate!);
  }
  return formatter.format(task.endDate!);
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
