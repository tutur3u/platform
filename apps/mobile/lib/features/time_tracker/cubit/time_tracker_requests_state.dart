import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/time_tracking/request.dart';

enum TimeTrackerRequestsStatus { initial, loading, loaded, error }

class TimeTrackerRequestsState extends Equatable {
  const TimeTrackerRequestsState({
    this.status = TimeTrackerRequestsStatus.initial,
    this.workspaceId,
    this.requests = const [],
    this.isFromCache = false,
    this.isRefreshing = false,
    this.lastUpdatedAt,
    this.selectedStatus,
    this.selectedUserId,
    this.error,
  });

  final TimeTrackerRequestsStatus status;
  final String? workspaceId;
  final List<TimeTrackingRequest> requests;
  final bool isFromCache;
  final bool isRefreshing;
  final DateTime? lastUpdatedAt;
  final ApprovalStatus? selectedStatus;
  final String? selectedUserId;
  final String? error;

  TimeTrackerRequestsState copyWith({
    TimeTrackerRequestsStatus? status,
    Object? workspaceId = _sentinel,
    List<TimeTrackingRequest>? requests,
    bool? isFromCache,
    bool? isRefreshing,
    Object? lastUpdatedAt = _sentinel,
    ApprovalStatus? selectedStatus,
    String? selectedUserId,
    String? error,
    bool clearSelectedStatus = false,
    bool clearSelectedUserId = false,
    bool clearError = false,
  }) => TimeTrackerRequestsState(
    status: status ?? this.status,
    workspaceId: workspaceId == _sentinel
        ? this.workspaceId
        : workspaceId as String?,
    requests: requests ?? this.requests,
    isFromCache: isFromCache ?? this.isFromCache,
    isRefreshing: isRefreshing ?? this.isRefreshing,
    lastUpdatedAt: lastUpdatedAt == _sentinel
        ? this.lastUpdatedAt
        : lastUpdatedAt as DateTime?,
    selectedStatus: clearSelectedStatus
        ? null
        : (selectedStatus ?? this.selectedStatus),
    selectedUserId: clearSelectedUserId
        ? null
        : (selectedUserId ?? this.selectedUserId),
    error: clearError ? null : (error ?? this.error),
  );

  @override
  List<Object?> get props => [
    status,
    workspaceId,
    requests,
    isFromCache,
    isRefreshing,
    lastUpdatedAt,
    selectedStatus,
    selectedUserId,
    error,
  ];
}

const _sentinel = Object();
