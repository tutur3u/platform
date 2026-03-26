import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/habit_tracker.dart';

const _sentinel = Object();

enum HabitsStatus { initial, loading, loaded, error }

class HabitActivityEntry extends Equatable {
  const HabitActivityEntry({
    required this.tracker,
    required this.entry,
  });

  final HabitTracker tracker;
  final HabitTrackerEntry entry;

  DateTime get timestamp => entry.occurredAt ?? entry.createdAt;

  @override
  List<Object?> get props => [tracker, entry];
}

class HabitsState extends Equatable {
  const HabitsState({
    this.status = HabitsStatus.initial,
    this.detailStatus = HabitsStatus.initial,
    this.activityStatus = HabitsStatus.initial,
    this.activeWorkspaceId,
    this.listResponse,
    this.detail,
    this.activityEntries = const [],
    this.selectedTrackerId,
    this.selectedScope = HabitTrackerScope.self,
    this.selectedMemberId,
    this.searchQuery = '',
    this.quickLogDrafts = const {},
    this.isSubmittingTracker = false,
    this.isSubmittingEntry = false,
    this.isSubmittingStreakAction = false,
    this.isArchivingTracker = false,
    this.error,
    this.detailError,
    this.activityError,
    this.detailScope,
    this.detailScopeUserId,
  });

  final HabitsStatus status;
  final HabitsStatus detailStatus;
  final HabitsStatus activityStatus;
  final String? activeWorkspaceId;
  final HabitTrackerListResponse? listResponse;
  final HabitTrackerDetailResponse? detail;
  final List<HabitActivityEntry> activityEntries;
  final String? selectedTrackerId;
  final HabitTrackerScope selectedScope;
  final String? selectedMemberId;
  final String searchQuery;
  final Map<String, String> quickLogDrafts;
  final bool isSubmittingTracker;
  final bool isSubmittingEntry;
  final bool isSubmittingStreakAction;
  final bool isArchivingTracker;
  final String? error;
  final String? detailError;
  final String? activityError;
  final HabitTrackerScope? detailScope;
  final String? detailScopeUserId;

  List<HabitTrackerCardSummary> get trackers =>
      listResponse?.trackers ?? const [];

  List<HabitTrackerMember> get members => listResponse?.members ?? const [];

  List<HabitTrackerCardSummary> get filteredTrackers {
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

  HabitTrackerCardSummary? get selectedTrackerSummary {
    final trackerId = selectedTrackerId;
    if (trackerId == null || trackerId.isEmpty) {
      return null;
    }

    for (final tracker in trackers) {
      if (tracker.tracker.id == trackerId) {
        return tracker;
      }
    }
    return null;
  }

  String quickDraftFor(String trackerId) => quickLogDrafts[trackerId] ?? '';

  HabitsState copyWith({
    HabitsStatus? status,
    HabitsStatus? detailStatus,
    HabitsStatus? activityStatus,
    Object? activeWorkspaceId = _sentinel,
    Object? listResponse = _sentinel,
    Object? detail = _sentinel,
    List<HabitActivityEntry>? activityEntries,
    Object? selectedTrackerId = _sentinel,
    HabitTrackerScope? selectedScope,
    Object? selectedMemberId = _sentinel,
    String? searchQuery,
    Map<String, String>? quickLogDrafts,
    bool? isSubmittingTracker,
    bool? isSubmittingEntry,
    bool? isSubmittingStreakAction,
    bool? isArchivingTracker,
    Object? error = _sentinel,
    Object? detailError = _sentinel,
    Object? activityError = _sentinel,
    Object? detailScope = _sentinel,
    Object? detailScopeUserId = _sentinel,
  }) {
    return HabitsState(
      status: status ?? this.status,
      detailStatus: detailStatus ?? this.detailStatus,
      activityStatus: activityStatus ?? this.activityStatus,
      activeWorkspaceId: activeWorkspaceId == _sentinel
          ? this.activeWorkspaceId
          : activeWorkspaceId as String?,
      listResponse: listResponse == _sentinel
          ? this.listResponse
          : listResponse as HabitTrackerListResponse?,
      detail: detail == _sentinel
          ? this.detail
          : detail as HabitTrackerDetailResponse?,
      activityEntries: activityEntries ?? this.activityEntries,
      selectedTrackerId: selectedTrackerId == _sentinel
          ? this.selectedTrackerId
          : selectedTrackerId as String?,
      selectedScope: selectedScope ?? this.selectedScope,
      selectedMemberId: selectedMemberId == _sentinel
          ? this.selectedMemberId
          : selectedMemberId as String?,
      searchQuery: searchQuery ?? this.searchQuery,
      quickLogDrafts: quickLogDrafts ?? this.quickLogDrafts,
      isSubmittingTracker: isSubmittingTracker ?? this.isSubmittingTracker,
      isSubmittingEntry: isSubmittingEntry ?? this.isSubmittingEntry,
      isSubmittingStreakAction:
          isSubmittingStreakAction ?? this.isSubmittingStreakAction,
      isArchivingTracker: isArchivingTracker ?? this.isArchivingTracker,
      error: error == _sentinel ? this.error : error as String?,
      detailError: detailError == _sentinel
          ? this.detailError
          : detailError as String?,
      activityError: activityError == _sentinel
          ? this.activityError
          : activityError as String?,
      detailScope: detailScope == _sentinel
          ? this.detailScope
          : detailScope as HabitTrackerScope?,
      detailScopeUserId: detailScopeUserId == _sentinel
          ? this.detailScopeUserId
          : detailScopeUserId as String?,
    );
  }

  @override
  List<Object?> get props => [
    status,
    detailStatus,
    activityStatus,
    activeWorkspaceId,
    listResponse,
    detail,
    activityEntries,
    selectedTrackerId,
    selectedScope,
    selectedMemberId,
    searchQuery,
    quickLogDrafts,
    isSubmittingTracker,
    isSubmittingEntry,
    isSubmittingStreakAction,
    isArchivingTracker,
    error,
    detailError,
    activityError,
    detailScope,
    detailScopeUserId,
  ];
}
