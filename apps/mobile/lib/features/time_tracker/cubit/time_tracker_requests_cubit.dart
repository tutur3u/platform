import 'package:bloc/bloc.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_requests_state.dart';

class TimeTrackerRequestsCubit extends Cubit<TimeTrackerRequestsState> {
  TimeTrackerRequestsCubit({required TimeTrackerRepository repository})
    : _repo = repository,
      super(const TimeTrackerRequestsState());

  final TimeTrackerRepository _repo;
  int _latestLoadToken = 0;

  Future<void> loadRequests(String wsId) async {
    final loadToken = ++_latestLoadToken;

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

      if (loadToken != _latestLoadToken) {
        return;
      }

      emit(
        state.copyWith(
          status: TimeTrackerRequestsStatus.loaded,
          requests: requests,
        ),
      );
    } on Exception catch (e) {
      if (loadToken != _latestLoadToken) {
        return;
      }

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
        wsId,
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
        wsId,
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
        wsId,
        requestId,
        status: ApprovalStatus.needsInfo,
        reason: reason,
      );
      await loadRequests(wsId);
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
    }
  }

  Future<TimeTrackingRequest?> updateRequest(
    String wsId,
    String requestId,
    String title,
    DateTime startTime,
    DateTime endTime, {
    String? description,
    List<String>? removedImages,
    List<String>? newImagePaths,
  }) async {
    try {
      final updatedRequest = await _repo.updateRequest(
        wsId,
        requestId,
        title,
        startTime,
        endTime,
        description: description,
        removedImages: removedImages,
        newImagePaths: newImagePaths,
      );

      // Update only the specific request in the list instead of full reload
      final updatedRequests = state.requests.map((r) {
        return r.id == requestId ? updatedRequest : r;
      }).toList();

      emit(
        state.copyWith(
          requests: updatedRequests,
          status: TimeTrackerRequestsStatus.loaded,
        ),
      );

      return updatedRequest;
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
      return null;
    }
  }
}
