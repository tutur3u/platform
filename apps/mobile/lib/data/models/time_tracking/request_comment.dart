import 'package:equatable/equatable.dart';

class TimeTrackingRequestComment extends Equatable {
  const TimeTrackingRequestComment({
    required this.id,
    this.requestId,
    this.userId,
    this.content,
    this.createdAt,
    this.updatedAt,
    this.userDisplayName,
    this.userAvatarUrl,
  });

  factory TimeTrackingRequestComment.fromJson(Map<String, dynamic> json) {
    final userRaw = json['user'];
    Map<String, dynamic>? user;
    if (userRaw is Map<String, dynamic>) {
      user = userRaw;
    } else if (userRaw is List && userRaw.isNotEmpty) {
      final first = userRaw.first;
      if (first is Map<String, dynamic>) {
        user = first;
      }
    }

    return TimeTrackingRequestComment(
      id: json['id'] as String,
      requestId: json['request_id'] as String?,
      userId: (json['user_id'] as String?) ?? (user?['id'] as String?),
      content: json['content'] as String?,
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'] as String)
          : null,
      updatedAt: json['updated_at'] != null
          ? DateTime.parse(json['updated_at'] as String)
          : null,
      userDisplayName: user?['display_name'] as String?,
      userAvatarUrl: user?['avatar_url'] as String?,
    );
  }

  final String id;
  final String? requestId;
  final String? userId;
  final String? content;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String? userDisplayName;
  final String? userAvatarUrl;

  bool canEditOrDelete(String? currentUserId, {Duration? timeWindow}) {
    if (currentUserId == null || userId == null || createdAt == null) {
      return false;
    }

    if (currentUserId != userId) {
      return false;
    }

    final window = timeWindow ?? const Duration(minutes: 15);
    return DateTime.now().difference(createdAt!).abs() <= window;
  }

  @override
  List<Object?> get props => [
    id,
    requestId,
    userId,
    content,
    createdAt,
    updatedAt,
    userDisplayName,
    userAvatarUrl,
  ];
}
