import 'package:bloc/bloc.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/repositories/habit_tracker_repository.dart';
import 'package:mobile/features/habits/cubit/habits_state.dart';

class HabitsCubit extends Cubit<HabitsState> {
  HabitsCubit({required IHabitTrackerRepository repository})
    : _repository = repository,
      super(const HabitsState());

  final IHabitTrackerRepository _repository;
  int _listRequestToken = 0;
  int _detailRequestToken = 0;

  Future<void> loadWorkspace(
    String wsId, {
    bool refresh = false,
    HabitTrackerScope? scopeOverride,
  }) async {
    final isSameWorkspace = state.activeWorkspaceId == wsId;
    final effectiveScope = scopeOverride ?? state.selectedScope;
    final requestedMemberId = effectiveScope == HabitTrackerScope.member
        ? state.selectedMemberId
        : null;
    if (!refresh &&
        isSameWorkspace &&
        state.status == HabitsStatus.loaded &&
        state.listResponse != null &&
        effectiveScope == state.selectedScope) {
      return;
    }

    final requestToken = ++_listRequestToken;
    emit(
      state.copyWith(
        status: HabitsStatus.loading,
        activeWorkspaceId: wsId,
        selectedScope: effectiveScope,
        selectedMemberId: requestedMemberId,
        error: null,
        detailError: null,
      ),
    );

    try {
      final previousMemberId = state.selectedMemberId;
      final response = await _repository.listTrackers(
        wsId,
        scope: effectiveScope,
        userId: requestedMemberId,
      );

      if (_isStaleListRequest(wsId, requestToken)) {
        return;
      }

      final nextMemberId = _resolveSelectedMemberId(
        scope: effectiveScope,
        requestedMemberId: requestedMemberId,
        response: response,
      );

      final nextTrackerId = _resolveSelectedTrackerId(
        requestedTrackerId: state.selectedTrackerId,
        trackers: response.trackers,
        searchQuery: state.searchQuery,
      );

      emit(
        state.copyWith(
          status: HabitsStatus.loaded,
          listResponse: response,
          selectedScope: effectiveScope,
          selectedMemberId: nextMemberId,
          selectedTrackerId: nextTrackerId,
          error: null,
        ),
      );

      if (effectiveScope == HabitTrackerScope.member &&
          nextMemberId != previousMemberId &&
          nextMemberId != null) {
        await loadWorkspace(
          wsId,
          refresh: true,
          scopeOverride: effectiveScope,
        );
        return;
      }

      if (nextTrackerId != null) {
        await loadTrackerDetail(nextTrackerId);
      } else {
        emit(
          state.copyWith(
            detailStatus: HabitsStatus.initial,
            detail: null,
            detailError: null,
            detailScope: null,
            detailScopeUserId: null,
          ),
        );
      }
    } on Exception catch (error) {
      if (_isStaleListRequest(wsId, requestToken)) {
        return;
      }

      emit(
        state.copyWith(
          status: HabitsStatus.error,
          error: error.toString(),
          listResponse: null,
          selectedTrackerId: null,
          detail: null,
          detailStatus: HabitsStatus.initial,
          detailScope: null,
          detailScopeUserId: null,
        ),
      );
    }
  }

  Future<void> loadTrackerDetail(
    String trackerId, {
    bool refresh = false,
  }) async {
    final wsId = state.activeWorkspaceId;
    final detailScope = state.selectedScope;
    final detailScopeUserId = detailScope == HabitTrackerScope.member
        ? state.selectedMemberId
        : null;
    if (wsId == null || wsId.isEmpty) {
      return;
    }
    if (!refresh &&
        state.detailStatus == HabitsStatus.loaded &&
        state.detail?.tracker.id == trackerId &&
        state.detailScope == detailScope &&
        state.detailScopeUserId == detailScopeUserId) {
      emit(state.copyWith(selectedTrackerId: trackerId));
      return;
    }

    final requestToken = ++_detailRequestToken;
    emit(
      state.copyWith(
        selectedTrackerId: trackerId,
        detailStatus: HabitsStatus.loading,
        detailError: null,
      ),
    );

    try {
      final detail = await _repository.getTrackerDetail(
        wsId,
        trackerId,
        scope: detailScope,
        userId: detailScopeUserId,
      );

      if (_isStaleDetailRequest(wsId, trackerId, requestToken)) {
        return;
      }

      emit(
        state.copyWith(
          detail: detail,
          detailStatus: HabitsStatus.loaded,
          detailError: null,
          detailScope: detailScope,
          detailScopeUserId: detailScopeUserId,
        ),
      );
    } on Exception catch (error) {
      if (_isStaleDetailRequest(wsId, trackerId, requestToken)) {
        return;
      }
      emit(
        state.copyWith(
          detailStatus: HabitsStatus.error,
          detailError: error.toString(),
        ),
      );
    }
  }

  Future<void> setScope(HabitTrackerScope scope) async {
    if (state.selectedScope == scope) {
      return;
    }
    emit(
      state.copyWith(
        selectedScope: scope,
        selectedMemberId: scope == HabitTrackerScope.member
            ? state.selectedMemberId
            : null,
      ),
    );
    final wsId = state.activeWorkspaceId;
    if (wsId != null && wsId.isNotEmpty) {
      await loadWorkspace(wsId, refresh: true);
    }
  }

  Future<void> setSelectedMember(String? userId) async {
    if (state.selectedMemberId == userId) {
      return;
    }
    emit(state.copyWith(selectedMemberId: userId));
    final wsId = state.activeWorkspaceId;
    if (wsId != null && wsId.isNotEmpty) {
      await loadWorkspace(wsId, refresh: true);
    }
  }

  Future<void> selectTracker(String trackerId) async {
    final detailScopeUserId = state.selectedScope == HabitTrackerScope.member
        ? state.selectedMemberId
        : null;
    if (trackerId == state.selectedTrackerId &&
        state.detail?.tracker.id == trackerId &&
        state.detailStatus == HabitsStatus.loaded &&
        state.detailScope == state.selectedScope &&
        state.detailScopeUserId == detailScopeUserId) {
      return;
    }

    await loadTrackerDetail(trackerId);
  }

  void setSearchQuery(String value) {
    final nextTrackerId = _resolveSelectedTrackerId(
      requestedTrackerId: state.selectedTrackerId,
      trackers: state.trackers,
      searchQuery: value,
    );

    emit(state.copyWith(searchQuery: value, selectedTrackerId: nextTrackerId));
  }

  void setQuickLogDraft(String trackerId, String value) {
    final drafts = <String, String>{...state.quickLogDrafts, trackerId: value};
    emit(state.copyWith(quickLogDrafts: drafts));
  }

  Future<void> createTracker(HabitTrackerInput input) async {
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    emit(state.copyWith(isSubmittingTracker: true, error: null));
    try {
      final tracker = await _repository.createTracker(wsId, input);
      await _reloadAfterMutation(selectTrackerId: tracker.id);
    } finally {
      emit(state.copyWith(isSubmittingTracker: false));
    }
  }

  Future<void> updateTracker(String trackerId, HabitTrackerInput input) async {
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    emit(state.copyWith(isSubmittingTracker: true, error: null));
    try {
      final tracker = await _repository.updateTracker(wsId, trackerId, input);
      await _reloadAfterMutation(selectTrackerId: tracker.id);
    } finally {
      emit(state.copyWith(isSubmittingTracker: false));
    }
  }

  Future<void> archiveTracker(String trackerId) async {
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    emit(state.copyWith(isArchivingTracker: true, error: null));
    try {
      await _repository.archiveTracker(wsId, trackerId);
      final nextTrackers = state.trackers
          .where((value) => value.tracker.id != trackerId)
          .toList(growable: false);
      final nextTrackerId = nextTrackers.isEmpty
          ? null
          : nextTrackers.first.tracker.id;
      await _reloadAfterMutation(selectTrackerId: nextTrackerId);
    } finally {
      emit(state.copyWith(isArchivingTracker: false));
    }
  }

  Future<void> createEntry(
    String trackerId,
    HabitTrackerEntryInput input,
  ) async {
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    emit(state.copyWith(isSubmittingEntry: true, error: null));
    try {
      await _repository.createEntry(wsId, trackerId, input);
      final drafts = <String, String>{...state.quickLogDrafts}
        ..remove(trackerId);
      emit(state.copyWith(quickLogDrafts: drafts));
      await _reloadAfterMutation(selectTrackerId: trackerId);
    } finally {
      emit(state.copyWith(isSubmittingEntry: false));
    }
  }

  Future<void> deleteEntry(String trackerId, String entryId) async {
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    emit(state.copyWith(isSubmittingEntry: true, error: null));
    try {
      await _repository.deleteEntry(wsId, trackerId, entryId);
      await _reloadAfterMutation(selectTrackerId: trackerId);
    } finally {
      emit(state.copyWith(isSubmittingEntry: false));
    }
  }

  Future<void> createStreakAction(
    String trackerId,
    HabitTrackerStreakActionInput input,
  ) async {
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    emit(state.copyWith(isSubmittingStreakAction: true, error: null));
    try {
      await _repository.createStreakAction(wsId, trackerId, input);
      await _reloadAfterMutation(selectTrackerId: trackerId);
    } finally {
      emit(state.copyWith(isSubmittingStreakAction: false));
    }
  }

  Future<void> _reloadAfterMutation({String? selectTrackerId}) async {
    final wsId = state.activeWorkspaceId;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    emit(state.copyWith(selectedTrackerId: selectTrackerId));
    await loadWorkspace(wsId, refresh: true);
    if (selectTrackerId != null) {
      await loadTrackerDetail(selectTrackerId, refresh: true);
    }
  }

  bool _isStaleListRequest(String wsId, int requestToken) {
    return state.activeWorkspaceId != wsId || requestToken != _listRequestToken;
  }

  bool _isStaleDetailRequest(String wsId, String trackerId, int requestToken) {
    return state.activeWorkspaceId != wsId ||
        state.selectedTrackerId != trackerId ||
        requestToken != _detailRequestToken;
  }

  String? _resolveSelectedMemberId({
    required HabitTrackerScope scope,
    required String? requestedMemberId,
    required HabitTrackerListResponse response,
  }) {
    if (scope != HabitTrackerScope.member) {
      return null;
    }
    if (response.members.isEmpty) {
      return null;
    }
    if (requestedMemberId != null &&
        response.members.any((value) => value.userId == requestedMemberId)) {
      return requestedMemberId;
    }
    return response.members.first.userId;
  }

  String? _resolveSelectedTrackerId({
    required String? requestedTrackerId,
    required List<HabitTrackerCardSummary> trackers,
    required String searchQuery,
  }) {
    if (trackers.isEmpty) {
      return null;
    }
    final filtered = _filterTrackers(trackers, searchQuery);
    final visibleTrackers = filtered.isEmpty ? trackers : filtered;
    if (requestedTrackerId != null &&
        visibleTrackers.any(
          (value) => value.tracker.id == requestedTrackerId,
        )) {
      return requestedTrackerId;
    }
    return visibleTrackers.first.tracker.id;
  }

  List<HabitTrackerCardSummary> _filterTrackers(
    List<HabitTrackerCardSummary> trackers,
    String searchQuery,
  ) {
    final query = searchQuery.trim().toLowerCase();
    if (query.isEmpty) {
      return trackers;
    }
    return trackers
        .where((tracker) {
          final name = tracker.tracker.name.toLowerCase();
          final description = (tracker.tracker.description ?? '').toLowerCase();
          return name.contains(query) || description.contains(query);
        })
        .toList(growable: false);
  }
}
