import 'package:equatable/equatable.dart';

class TimeTrackingRequestComment extends Equatable {
  const TimeTrackingRequestComment({
    required this.id,
    this.requestId,
    this.userId,
    this.content,
    this.createdAt,
    this.updatedAt,
  });

  factory TimeTrackingRequestComment.fromJson(Map<String, dynamic> json) =>
      TimeTrackingRequestComment(
        id: json['id'] as String,
        requestId: json['request_id'] as String?,
        userId: json['user_id'] as String?,
        content: json['content'] as String?,
        createdAt: json['created_at'] != null
            ? DateTime.parse(json['created_at'] as String)
            : null,
        updatedAt: json['updated_at'] != null
            ? DateTime.parse(json['updated_at'] as String)
            : null,
      );

  final String id;
  final String? requestId;
  final String? userId;
  final String? content;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  @override
  List<Object?> get props => [
    id,
    requestId,
    userId,
    content,
    createdAt,
    updatedAt,
  ];
}
