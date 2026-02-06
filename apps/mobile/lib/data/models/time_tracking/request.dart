import 'package:equatable/equatable.dart';

enum ApprovalStatus { pending, approved, rejected, needsInfo }

ApprovalStatus approvalStatusFromString(String? value) {
  return switch (value) {
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
    this.startTime,
    this.endTime,
    this.images = const [],
    this.approvalStatus = ApprovalStatus.pending,
    this.approvedBy,
    this.approvedAt,
    this.rejectedBy,
    this.rejectedAt,
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
        approvedAt: json['approved_at'] != null
            ? DateTime.parse(json['approved_at'] as String)
            : null,
        rejectedBy: json['rejected_by'] as String?,
        rejectedAt: json['rejected_at'] != null
            ? DateTime.parse(json['rejected_at'] as String)
            : null,
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
  final DateTime? startTime;
  final DateTime? endTime;
  final List<String> images;
  final ApprovalStatus approvalStatus;
  final String? approvedBy;
  final DateTime? approvedAt;
  final String? rejectedBy;
  final DateTime? rejectedAt;
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
    startTime,
    endTime,
    images,
    approvalStatus,
    approvedBy,
    approvedAt,
    rejectedBy,
    rejectedAt,
    rejectionReason,
    needsInfoReason,
    createdAt,
    updatedAt,
  ];
}
