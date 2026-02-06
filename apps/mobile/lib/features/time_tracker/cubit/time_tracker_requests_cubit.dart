import 'package:bloc/bloc.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_requests_state.dart';

class TimeTrackerRequestsCubit extends Cubit<TimeTrackerRequestsState> {
  TimeTrackerRequestsCubit({required TimeTrackerRepository repository})
    : _repo = repository,
      super(const TimeTrackerRequestsState());

  final TimeTrackerRepository _repo;

  Future<void> loadRequests(String wsId) async {
    emit(
      state.copyWith(
        status: TimeTrackerRequestsStatus.loading,
        clearError: true,
      ),
    );

    try {
      final statusFilter = state.selectedStatus != null
          ? approvalStatusToString(state.selectedStatus!)
          : null;

      final requests = await _repo.getRequests(wsId, status: statusFilter);

      emit(
        state.copyWith(
          status: TimeTrackerRequestsStatus.loaded,
          requests: requests,
        ),
      );
    } on Exception catch (e) {
      emit(
        state.copyWith(
          status: TimeTrackerRequestsStatus.error,
          error: e.toString(),
        ),
      );
    }
  }

  Future<void> filterByStatus(ApprovalStatus? status, String wsId) async {
    if (status == null) {
      emit(state.copyWith(clearSelectedStatus: true));
    } else {
      emit(state.copyWith(selectedStatus: status));
    }
    await loadRequests(wsId);
  }

  Future<void> approveRequest(String requestId, String wsId) async {
    try {
      await _repo.updateRequestStatus(
        requestId,
        status: ApprovalStatus.approved,
      );
      await loadRequests(wsId);
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
    }
  }

  Future<void> rejectRequest(
    String requestId,
    String wsId, {
    String? reason,
  }) async {
    try {
      await _repo.updateRequestStatus(
        requestId,
        status: ApprovalStatus.rejected,
        reason: reason,
      );
      await loadRequests(wsId);
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
    }
  }

  Future<void> requestMoreInfo(
    String requestId,
    String wsId, {
    String? reason,
  }) async {
    try {
      await _repo.updateRequestStatus(
        requestId,
        status: ApprovalStatus.needsInfo,
        reason: reason,
      );
      await loadRequests(wsId);
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
    }
  }
}
