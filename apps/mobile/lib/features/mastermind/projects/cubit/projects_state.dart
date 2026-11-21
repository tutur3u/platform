import 'package:flutter/foundation.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';

enum ProjectsStatus { loading, ready, failed }

/// Loaded threads of one list: an expanded project group or the flat list.
@immutable
class ThreadListSlice {
  const ThreadListSlice({
    this.threads = const [],
    this.total = 0,
    this.nextCursor,
    this.loading = false,
    this.failure,
  });

  final List<ProjectThread> threads;
  final int total;
  final int? nextCursor;
  final bool loading;
  final ProjectsFailureKind? failure;

  bool get hasMore => nextCursor != null;

  ThreadListSlice copyWith({
    List<ProjectThread>? threads,
    int? total,
    int? Function()? nextCursor,
    bool? loading,
    ProjectsFailureKind? Function()? failure,
  }) => ThreadListSlice(
    threads: threads ?? this.threads,
    total: total ?? this.total,
    nextCursor: nextCursor == null ? this.nextCursor : nextCursor(),
    loading: loading ?? this.loading,
    failure: failure == null ? this.failure : failure(),
  );
}

@immutable
class ProjectsState {
  const ProjectsState({
    this.machines = const [],
    this.machine,
    this.filter,
    this.search = '',
    this.status = ProjectsStatus.loading,
    this.failure,
    this.overview,
    this.fetchedAt,
    this.expanded = const {},
    this.groups = const {},
    this.flat = const ThreadListSlice(),
    this.groupable = true,
    this.busy = false,
    this.rollbacks = 0,
  });

  final List<ProjectsMachine> machines;
  final ProjectsMachine? machine;
  final ProjectThreadState? filter;
  final String search;
  final ProjectsStatus status;

  /// The last read's failure. With a list still on screen it is shown as a
  /// line above it rather than in place of it.
  final ProjectsFailureKind? failure;
  final ProjectsOverview? overview;

  /// When the list on screen was read (or cached).
  final DateTime? fetchedAt;
  final Set<String> expanded;
  final Map<String, ThreadListSlice> groups;
  final ThreadListSlice flat;

  /// False once the project read answered 404 (not deployed): the bridge
  /// machine then lists flat too. A later visit asks again.
  final bool groupable;

  /// A changed filter or search is being read; the previous list stays on
  /// screen until the answer replaces it.
  final bool busy;

  /// Counts reverted filter or search changes, so the search field can
  /// show the search that is in effect again.
  final int rollbacks;

  /// Linked machines and searches list flat, newest first; the bridge
  /// machine groups by project when the repository can.
  bool get flatMode =>
      !groupable || (machine?.linked ?? false) || search.trim().isNotEmpty;

  bool get hasContent => flatMode
      ? flat.threads.isNotEmpty || fetchedAt != null
      : overview != null;

  /// A list read earlier (or from cache) is on screen because the latest
  /// read failed or has not answered.
  bool get stale =>
      fetchedAt != null &&
      (failure == ProjectsFailureKind.machineOffline ||
          (!flatMode && overview?.cachedAt != null));

  ProjectsState copyWith({
    List<ProjectsMachine>? machines,
    ProjectsMachine? machine,
    ProjectThreadState? Function()? filter,
    String? search,
    ProjectsStatus? status,
    ProjectsFailureKind? Function()? failure,
    ProjectsOverview? Function()? overview,
    DateTime? Function()? fetchedAt,
    Set<String>? expanded,
    Map<String, ThreadListSlice>? groups,
    ThreadListSlice? flat,
    bool? groupable,
    bool? busy,
    int? rollbacks,
  }) => ProjectsState(
    machines: machines ?? this.machines,
    machine: machine ?? this.machine,
    filter: filter == null ? this.filter : filter(),
    search: search ?? this.search,
    status: status ?? this.status,
    failure: failure == null ? this.failure : failure(),
    overview: overview == null ? this.overview : overview(),
    fetchedAt: fetchedAt == null ? this.fetchedAt : fetchedAt(),
    expanded: expanded ?? this.expanded,
    groups: groups ?? this.groups,
    flat: flat ?? this.flat,
    groupable: groupable ?? this.groupable,
    busy: busy ?? this.busy,
    rollbacks: rollbacks ?? this.rollbacks,
  );
}
