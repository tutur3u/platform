import 'package:equatable/equatable.dart';

enum ApprovalStatus { pending, approved, rejected, needsInfo }

ApprovalStatus approvalStatusFromString(String? value) {
  final normalized = value?.toLowerCase();

  return switch (normalized) {
    'approved' => ApprovalStatus.approved,
    'rejected' => ApprovalStatus.rejected,
    'needs_info' => ApprovalStatus.needsInfo,
    _ => ApprovalStatus.pending,
  };
}

String approvalStatusToString(ApprovalStatus status) {
  return switch (status) {
    ApprovalStatus.pending => 'pending',
    ApprovalStatus.approved => 'approved',
    ApprovalStatus.rejected => 'rejected',
    ApprovalStatus.needsInfo => 'needs_info',
  };
}

class TimeTrackingRequest extends Equatable {
  const TimeTrackingRequest({
    required this.id,
    this.workspaceId,
    this.userId,
    this.taskId,
    this.categoryId,
    this.title,
    this.description,
    this.userDisplayName,
    this.userAvatarUrl,
    this.startTime,
    this.endTime,
    this.images = const [],
    this.approvalStatus = ApprovalStatus.pending,
    this.approvedBy,
    this.approvedByName,
    this.approvedAt,
    this.rejectedBy,
    this.rejectedByName,
    this.rejectedAt,
    this.needsInfoRequestedByName,
    this.rejectionReason,
    this.needsInfoReason,
    this.createdAt,
    this.updatedAt,
  });

  factory TimeTrackingRequest.fromJson(Map<String, dynamic> json) =>
      TimeTrackingRequest(
        id: json['id'] as String,
        workspaceId: json['ws_id'] as String?,
        userId: json['user_id'] as String?,
        taskId: json['task_id'] as String?,
        categoryId: json['category_id'] as String?,
        title: json['title'] as String?,
        description: json['description'] as String?,
        userDisplayName: _nestedDisplayName(json['user']),
        userAvatarUrl: _nestedAvatarUrl(json['user']),
        startTime: json['start_time'] != null
            ? DateTime.parse(json['start_time'] as String)
            : null,
        endTime: json['end_time'] != null
            ? DateTime.parse(json['end_time'] as String)
            : null,
        images:
            (json['images'] as List<dynamic>?)
                ?.map((e) => e as String)
                .toList() ??
            const [],
        approvalStatus: approvalStatusFromString(
          json['approval_status'] as String?,
        ),
        approvedBy: json['approved_by'] as String?,
        approvedByName: _nestedDisplayName(json['approved_by_user']),
        approvedAt: json['approved_at'] != null
            ? DateTime.parse(json['approved_at'] as String)
            : null,
        rejectedBy: json['rejected_by'] as String?,
        rejectedByName: _nestedDisplayName(json['rejected_by_user']),
        rejectedAt: json['rejected_at'] != null
            ? DateTime.parse(json['rejected_at'] as String)
            : null,
        needsInfoRequestedByName: _nestedDisplayName(
          json['needs_info_requested_by_user'],
        ),
        rejectionReason: json['rejection_reason'] as String?,
        needsInfoReason: json['needs_info_reason'] as String?,
        createdAt: json['created_at'] != null
            ? DateTime.parse(json['created_at'] as String)
            : null,
        updatedAt: json['updated_at'] != null
            ? DateTime.parse(json['updated_at'] as String)
            : null,
      );

  final String id;
  final String? workspaceId;
  final String? userId;
  final String? taskId;
  final String? categoryId;
  final String? title;
  final String? description;
  final String? userDisplayName;
  final String? userAvatarUrl;
  final DateTime? startTime;
  final DateTime? endTime;
  final List<String> images;
  final ApprovalStatus approvalStatus;
  final String? approvedBy;
  final String? approvedByName;
  final DateTime? approvedAt;
  final String? rejectedBy;
  final String? rejectedByName;
  final DateTime? rejectedAt;
  final String? needsInfoRequestedByName;
  final String? rejectionReason;
  final String? needsInfoReason;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  Duration get duration {
    if (startTime == null || endTime == null) return Duration.zero;
    return endTime!.difference(startTime!);
  }

  @override
  List<Object?> get props => [
    id,
    workspaceId,
    userId,
    taskId,
    categoryId,
    title,
    description,
    userDisplayName,
    userAvatarUrl,
    startTime,
    endTime,
    images,
    approvalStatus,
    approvedBy,
    approvedByName,
    approvedAt,
    rejectedBy,
    rejectedByName,
    rejectedAt,
    needsInfoRequestedByName,
    rejectionReason,
    needsInfoReason,
    createdAt,
    updatedAt,
  ];
}

String? _nestedDisplayName(dynamic value) {
  if (value is! Map<String, dynamic>) {
    return null;
  }

  final displayName = value['display_name'];
  return displayName is String && displayName.trim().isNotEmpty
      ? displayName.trim()
      : null;
}

String? _nestedAvatarUrl(dynamic value) {
  if (value is! Map<String, dynamic>) {
    return null;
  }

  final avatarUrl = value['avatar_url'];
  return avatarUrl is String && avatarUrl.trim().isNotEmpty
      ? avatarUrl.trim()
      : null;
}
