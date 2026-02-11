import 'package:equatable/equatable.dart';

enum TimeTrackingRequestActivityAction {
  created,
  contentUpdated,
  statusChanged,
  commentAdded,
  commentUpdated,
  commentDeleted,
  unknown,
}

TimeTrackingRequestActivityAction requestActivityActionFromString(
  String? value,
) {
  final normalized = value?.toUpperCase();

  return switch (normalized) {
    'CREATED' => TimeTrackingRequestActivityAction.created,
    'CONTENT_UPDATED' => TimeTrackingRequestActivityAction.contentUpdated,
    'STATUS_CHANGED' => TimeTrackingRequestActivityAction.statusChanged,
    'COMMENT_ADDED' => TimeTrackingRequestActivityAction.commentAdded,
    'COMMENT_UPDATED' => TimeTrackingRequestActivityAction.commentUpdated,
    'COMMENT_DELETED' => TimeTrackingRequestActivityAction.commentDeleted,
    _ => TimeTrackingRequestActivityAction.unknown,
  };
}

class TimeTrackingRequestActivity extends Equatable {
  const TimeTrackingRequestActivity({
    required this.id,
    required this.requestId,
    required this.actionType,
    required this.actorId,
    required this.createdAt,
    this.actorDisplayName,
    this.actorHandle,
    this.actorAvatarUrl,
    this.previousStatus,
    this.newStatus,
    this.feedbackReason,
    this.changedFields,
    this.commentId,
    this.commentContent,
    this.metadata,
  });

  factory TimeTrackingRequestActivity.fromJson(Map<String, dynamic> json) {
    return TimeTrackingRequestActivity(
      id: json['id'] as String,
      requestId: json['request_id'] as String,
      actionType: requestActivityActionFromString(
        json['action_type'] as String?,
      ),
      actorId: json['actor_id'] as String,
      actorDisplayName: json['actor_display_name'] as String?,
      actorHandle: json['actor_handle'] as String?,
      actorAvatarUrl: json['actor_avatar_url'] as String?,
      previousStatus: json['previous_status'] as String?,
      newStatus: json['new_status'] as String?,
      feedbackReason: json['feedback_reason'] as String?,
      changedFields: (json['changed_fields'] as Map<String, dynamic>?)?.map(
        (key, value) => MapEntry(
          key,
          (value as Map<String, dynamic>).cast<String, dynamic>(),
        ),
      ),
      commentId: json['comment_id'] as String?,
      commentContent: json['comment_content'] as String?,
      metadata: (json['metadata'] as Map<String, dynamic>?)
          ?.cast<String, dynamic>(),
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  final String id;
  final String requestId;
  final TimeTrackingRequestActivityAction actionType;
  final String actorId;
  final String? actorDisplayName;
  final String? actorHandle;
  final String? actorAvatarUrl;
  final String? previousStatus;
  final String? newStatus;
  final String? feedbackReason;
  final Map<String, Map<String, dynamic>>? changedFields;
  final String? commentId;
  final String? commentContent;
  final Map<String, dynamic>? metadata;
  final DateTime createdAt;

  String get actorLabel {
    if (actorDisplayName != null && actorDisplayName!.trim().isNotEmpty) {
      return actorDisplayName!;
    }
    if (actorHandle != null && actorHandle!.trim().isNotEmpty) {
      return actorHandle!;
    }
    return 'Unknown';
  }

  @override
  List<Object?> get props => [
    id,
    requestId,
    actionType,
    actorId,
    actorDisplayName,
    actorHandle,
    actorAvatarUrl,
    previousStatus,
    newStatus,
    feedbackReason,
    changedFields,
    commentId,
    commentContent,
    metadata,
    createdAt,
  ];
}

class TimeTrackingRequestActivityResponse extends Equatable {
  const TimeTrackingRequestActivityResponse({
    required this.data,
    required this.total,
    required this.page,
    required this.limit,
  });

  factory TimeTrackingRequestActivityResponse.fromJson(
    Map<String, dynamic> json,
  ) {
    final items = (json['data'] as List<dynamic>? ?? <dynamic>[])
        .map(
          (item) => TimeTrackingRequestActivity.fromJson(
            item as Map<String, dynamic>,
          ),
        )
        .toList();

    return TimeTrackingRequestActivityResponse(
      data: items,
      total: json['total'] as int? ?? 0,
      page: json['page'] as int? ?? 1,
      limit: json['limit'] as int? ?? 10,
    );
  }

  final List<TimeTrackingRequestActivity> data;
  final int total;
  final int page;
  final int limit;

  int get totalPages => total == 0 ? 1 : ((total + limit - 1) ~/ limit);

  @override
  List<Object?> get props => [data, total, page, limit];
}
