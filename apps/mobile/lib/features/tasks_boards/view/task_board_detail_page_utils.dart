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
