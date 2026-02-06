import 'package:equatable/equatable.dart';

class TimeTrackingSession extends Equatable {
  const TimeTrackingSession({
    required this.id,
    this.title,
    this.description,
    this.categoryId,
    this.categoryName,
    this.startTime,
    this.endTime,
    this.wsId,
    this.userId,
    this.taskId,
    this.parentSessionId,
    this.isRunningFlag,
    this.durationSeconds,
    this.wasResumed = false,
    this.pendingApproval = false,
    this.createdAt,
  });

  factory TimeTrackingSession.fromJson(Map<String, dynamic> json) =>
      TimeTrackingSession(
        id: json['id'] as String,
        title: json['title'] as String?,
        description: json['description'] as String?,
        categoryId: json['category_id'] as String?,
        categoryName: json['category_name'] as String?,
        startTime: json['start_time'] != null
            ? DateTime.parse(json['start_time'] as String)
            : null,
        endTime: json['end_time'] != null
            ? DateTime.parse(json['end_time'] as String)
            : null,
        wsId: json['ws_id'] as String?,
        userId: json['user_id'] as String?,
        taskId: json['task_id'] as String?,
        parentSessionId: json['parent_session_id'] as String?,
        isRunningFlag: json['is_running'] as bool?,
        durationSeconds: json['duration_seconds'] as int?,
        wasResumed: json['was_resumed'] as bool? ?? false,
        pendingApproval: json['pending_approval'] as bool? ?? false,
        createdAt: json['created_at'] != null
            ? DateTime.parse(json['created_at'] as String)
            : null,
      );

  final String id;
  final String? title;
  final String? description;
  final String? categoryId;
  final String? categoryName;
  final DateTime? startTime;
  final DateTime? endTime;
  final String? wsId;
  final String? userId;
  final String? taskId;
  final String? parentSessionId;
  final bool? isRunningFlag;
  final int? durationSeconds;
  final bool wasResumed;
  final bool pendingApproval;
  final DateTime? createdAt;

  bool get isRunning => isRunningFlag ?? (startTime != null && endTime == null);

  Duration get duration {
    if (durationSeconds != null) return Duration(seconds: durationSeconds!);
    if (startTime == null) return Duration.zero;
    final end = endTime ?? DateTime.now();
    return end.difference(startTime!);
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'description': description,
    'category_id': categoryId,
    'start_time': startTime?.toIso8601String(),
    'end_time': endTime?.toIso8601String(),
    'ws_id': wsId,
    'user_id': userId,
    'task_id': taskId,
    'parent_session_id': parentSessionId,
    'is_running': isRunningFlag,
    'duration_seconds': durationSeconds,
    'was_resumed': wasResumed,
    'pending_approval': pendingApproval,
    'created_at': createdAt?.toIso8601String(),
  };

  @override
  List<Object?> get props => [
    id,
    title,
    description,
    categoryId,
    categoryName,
    startTime,
    endTime,
    wsId,
    userId,
    taskId,
    parentSessionId,
    isRunningFlag,
    durationSeconds,
    wasResumed,
    pendingApproval,
    createdAt,
  ];
}
