import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/time_tracking/request.dart';

enum TimeTrackerRequestsStatus { initial, loading, loaded, error }

class TimeTrackerRequestsState extends Equatable {
  const TimeTrackerRequestsState({
    this.status = TimeTrackerRequestsStatus.initial,
    this.requests = const [],
    this.selectedStatus,
    this.selectedUserId,
    this.error,
  });

  final TimeTrackerRequestsStatus status;
  final List<TimeTrackingRequest> requests;
  final ApprovalStatus? selectedStatus;
  final String? selectedUserId;
  final String? error;

  TimeTrackerRequestsState copyWith({
    TimeTrackerRequestsStatus? status,
    List<TimeTrackingRequest>? requests,
    ApprovalStatus? selectedStatus,
    String? selectedUserId,
    String? error,
    bool clearSelectedStatus = false,
    bool clearSelectedUserId = false,
    bool clearError = false,
  }) => TimeTrackerRequestsState(
    status: status ?? this.status,
    requests: requests ?? this.requests,
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
    requests,
    selectedStatus,
    selectedUserId,
    error,
  ];
}
