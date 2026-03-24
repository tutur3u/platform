import 'package:equatable/equatable.dart';

class TaskLinkOption extends Equatable {
  const TaskLinkOption({
    required this.id,
    required this.name,
    this.displayNumber,
    this.listName,
    this.boardName,
    this.ticketPrefix,
    this.priority,
    this.startDate,
    this.endDate,
    this.completed,
    this.closedAt,
    this.assigneeCount = 0,
  });

  factory TaskLinkOption.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    if (id is! String || id.trim().isEmpty) {
      throw const FormatException(
        'Invalid task link option payload: missing task id',
      );
    }

    return TaskLinkOption(
      id: id,
      name: json['name'] as String? ?? '',
      displayNumber: (json['display_number'] as num?)?.toInt(),
      listName: _readListName(json),
      boardName: _readBoardName(json),
      ticketPrefix: _readTicketPrefix(json),
      priority: json['priority'] as String?,
      startDate: json['start_date'] != null
          ? DateTime.tryParse(json['start_date'] as String)
          : null,
      endDate: json['end_date'] != null
          ? DateTime.tryParse(json['end_date'] as String)
          : null,
      completed: json['completed'] as bool?,
      closedAt: json['closed_at'] != null
          ? DateTime.tryParse(json['closed_at'] as String)
          : null,
      assigneeCount: _readAssigneeCount(json),
    );
  }

  static String? _readListName(Map<String, dynamic> json) {
    final direct = json['list_name'] as String?;
    if (direct != null && direct.trim().isNotEmpty) {
      return direct;
    }

    final taskList = json['task_lists'];
    if (taskList is Map<String, dynamic>) {
      final nested = taskList['name'] as String?;
      if (nested != null && nested.trim().isNotEmpty) {
        return nested;
      }
    }

    return null;
  }

  static String? _readBoardName(Map<String, dynamic> json) {
    final direct = json['board_name'] as String?;
    if (direct != null && direct.trim().isNotEmpty) {
      return direct;
    }

    final taskList = json['task_lists'];
    if (taskList is! Map<String, dynamic>) {
      return null;
    }

    final workspaceBoard = taskList['workspace_boards'];
    if (workspaceBoard is! Map<String, dynamic>) {
      return null;
    }

    final nested = workspaceBoard['name'] as String?;
    if (nested != null && nested.trim().isNotEmpty) {
      return nested;
    }

    return null;
  }

  static String? _readTicketPrefix(Map<String, dynamic> json) {
    final direct = json['ticket_prefix'] as String?;
    if (direct != null && direct.trim().isNotEmpty) {
      return direct;
    }

    final taskList = json['task_lists'];
    if (taskList is! Map<String, dynamic>) {
      return null;
    }

    final workspaceBoard = taskList['workspace_boards'];
    if (workspaceBoard is! Map<String, dynamic>) {
      return null;
    }

    final nested = workspaceBoard['ticket_prefix'] as String?;
    if (nested != null && nested.trim().isNotEmpty) {
      return nested;
    }

    return null;
  }

  static int _readAssigneeCount(Map<String, dynamic> json) {
    final rawAssignees = json['assignees'];
    if (rawAssignees is List) {
      return rawAssignees.length;
    }
    final rawAssigneeIds = json['assignee_ids'];
    if (rawAssigneeIds is List) {
      return rawAssigneeIds.length;
    }
    return 0;
  }

  final String id;
  final String name;
  final int? displayNumber;
  final String? listName;
  final String? boardName;
  final String? ticketPrefix;
  final String? priority;
  final DateTime? startDate;
  final DateTime? endDate;
  final bool? completed;
  final DateTime? closedAt;
  final int assigneeCount;

  String? get ticketLabel {
    final display = displayNumber;
    if (display == null) {
      return null;
    }
    final prefix = ticketPrefix?.trim();
    if (prefix != null && prefix.isNotEmpty) {
      return '$prefix-$display';
    }
    return '#$display';
  }

  @override
  List<Object?> get props => [
    id,
    name,
    displayNumber,
    listName,
    boardName,
    ticketPrefix,
    priority,
    startDate,
    endDate,
    completed,
    closedAt,
    assigneeCount,
  ];
}
