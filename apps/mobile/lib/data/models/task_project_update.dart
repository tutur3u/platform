import 'package:equatable/equatable.dart';

class TaskProjectUpdateCreator extends Equatable {
  const TaskProjectUpdateCreator({
    required this.id,
    this.displayName,
    this.avatarUrl,
  });

  factory TaskProjectUpdateCreator.fromJson(Map<String, dynamic> json) {
    return TaskProjectUpdateCreator(
      id: json['id'] as String? ?? '',
      displayName: json['display_name'] as String?,
      avatarUrl: json['avatar_url'] as String?,
    );
  }

  final String id;
  final String? displayName;
  final String? avatarUrl;

  @override
  List<Object?> get props => [id, displayName, avatarUrl];
}

class TaskProjectUpdateReactionGroup extends Equatable {
  const TaskProjectUpdateReactionGroup({
    required this.emoji,
    required this.count,
  });

  factory TaskProjectUpdateReactionGroup.fromJson(Map<String, dynamic> json) {
    return TaskProjectUpdateReactionGroup(
      emoji: json['emoji'] as String? ?? '',
      count: (json['count'] as num?)?.toInt() ?? 0,
    );
  }

  final String emoji;
  final int count;

  @override
  List<Object?> get props => [emoji, count];
}

class TaskProjectUpdate extends Equatable {
  const TaskProjectUpdate({
    required this.id,
    required this.projectId,
    required this.creatorId,
    required this.content,
    required this.createdAt,
    this.updatedAt,
    this.creator,
    this.reactionGroups = const [],
    this.commentsCount = 0,
    this.attachmentsCount = 0,
  });

  factory TaskProjectUpdate.fromJson(Map<String, dynamic> json) {
    return TaskProjectUpdate(
      id: json['id'] as String? ?? '',
      projectId: json['project_id'] as String? ?? '',
      creatorId: json['creator_id'] as String? ?? '',
      content: json['content'] as String? ?? '',
      createdAt:
          DateTime.tryParse(json['created_at'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      updatedAt: DateTime.tryParse(json['updated_at'] as String? ?? ''),
      creator: json['creator'] is Map<String, dynamic>
          ? TaskProjectUpdateCreator.fromJson(
              json['creator'] as Map<String, dynamic>,
            )
          : null,
      reactionGroups: ((json['reactionGroups'] as List<dynamic>?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(TaskProjectUpdateReactionGroup.fromJson)
          .toList(growable: false),
      commentsCount: (json['commentsCount'] as num?)?.toInt() ?? 0,
      attachmentsCount: (json['attachmentsCount'] as num?)?.toInt() ?? 0,
    );
  }

  final String id;
  final String projectId;
  final String creatorId;
  final String content;
  final DateTime createdAt;
  final DateTime? updatedAt;
  final TaskProjectUpdateCreator? creator;
  final List<TaskProjectUpdateReactionGroup> reactionGroups;
  final int commentsCount;
  final int attachmentsCount;

  bool get isEdited => updatedAt != null && updatedAt != createdAt;

  @override
  List<Object?> get props => [
    id,
    projectId,
    creatorId,
    content,
    createdAt,
    updatedAt,
    creator,
    reactionGroups,
    commentsCount,
    attachmentsCount,
  ];
}
