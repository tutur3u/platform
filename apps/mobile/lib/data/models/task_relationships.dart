import 'package:equatable/equatable.dart';

enum TaskRelationshipType { parentChild, blocks, related }

extension TaskRelationshipTypeApi on TaskRelationshipType {
  String get apiValue {
    return switch (this) {
      TaskRelationshipType.parentChild => 'parent_child',
      TaskRelationshipType.blocks => 'blocks',
      TaskRelationshipType.related => 'related',
    };
  }
}

class RelatedTaskInfo extends Equatable {
  const RelatedTaskInfo({
    required this.id,
    required this.name,
    this.displayNumber,
    this.completed,
    this.priority,
    this.boardId,
    this.boardName,
  });

  factory RelatedTaskInfo.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    if (rawId is! String || rawId.trim().isEmpty) {
      throw const FormatException(
        'RelatedTaskInfo.fromJson: required field "id" is missing or invalid',
      );
    }

    return RelatedTaskInfo(
      id: rawId.trim(),
      name: (json['name'] as String?)?.trim() ?? '',
      displayNumber: (json['display_number'] as num?)?.toInt(),
      completed: json['completed'] as bool?,
      priority: (json['priority'] as String?)?.trim(),
      boardId: (json['board_id'] as String?)?.trim(),
      boardName: (json['board_name'] as String?)?.trim(),
    );
  }

  final String id;
  final String name;
  final int? displayNumber;
  final bool? completed;
  final String? priority;
  final String? boardId;
  final String? boardName;

  @override
  List<Object?> get props => [
    id,
    name,
    displayNumber,
    completed,
    priority,
    boardId,
    boardName,
  ];
}

class TaskRelationshipsResponse extends Equatable {
  const TaskRelationshipsResponse({
    this.parentTask,
    this.childTasks = const [],
    this.blockedBy = const [],
    this.blocking = const [],
    this.relatedTasks = const [],
  });

  factory TaskRelationshipsResponse.fromJson(Map<String, dynamic> json) {
    return TaskRelationshipsResponse(
      parentTask: json['parentTask'] is Map<String, dynamic>
          ? RelatedTaskInfo.fromJson(json['parentTask'] as Map<String, dynamic>)
          : null,
      childTasks: _parseTasks(json['childTasks']),
      blockedBy: _parseTasks(json['blockedBy']),
      blocking: _parseTasks(json['blocking']),
      relatedTasks: _parseTasks(json['relatedTasks']),
    );
  }

  static List<RelatedTaskInfo> _parseTasks(dynamic value) {
    if (value is! List<dynamic>) {
      return const [];
    }

    return value
        .whereType<Map<String, dynamic>>()
        .map(RelatedTaskInfo.fromJson)
        .toList(growable: false);
  }

  static const empty = TaskRelationshipsResponse();

  final RelatedTaskInfo? parentTask;
  final List<RelatedTaskInfo> childTasks;
  final List<RelatedTaskInfo> blockedBy;
  final List<RelatedTaskInfo> blocking;
  final List<RelatedTaskInfo> relatedTasks;

  int get totalCount {
    return (parentTask == null ? 0 : 1) +
        childTasks.length +
        blockedBy.length +
        blocking.length +
        relatedTasks.length;
  }

  @override
  List<Object?> get props => [
    parentTask,
    childTasks,
    blockedBy,
    blocking,
    relatedTasks,
  ];
}
