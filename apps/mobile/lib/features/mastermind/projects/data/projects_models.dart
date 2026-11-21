import 'package:flutter/foundation.dart';

/// A thread's agent state, read only from the row's `state`.
enum ProjectThreadState {
  running,
  waiting,
  failed,
  idle;

  static ProjectThreadState parse(Object? raw) =>
      values.where((s) => s.name == raw).firstOrNull ?? idle;
}

/// One machine the bridge can read threads from. The first one Web lists is
/// the bridge machine itself and carries no [environmentId]; the others are
/// linked environments reached through it. Every read names the bridge
/// [machineId].
@immutable
class ProjectsMachine {
  const ProjectsMachine({
    required this.machineId,
    required this.label,
    required this.reachable,
    this.environmentId,
  });

  /// GET /threads/machines: `{ machineId, machines: [...] }`.
  static List<ProjectsMachine> listFromJson(Map<String, dynamic> json) {
    final machineId = json['machineId'] as String;
    return [
      for (final raw in json['machines'] as List<dynamic>? ?? const [])
        if (raw case final Map<String, dynamic> m)
          ProjectsMachine(
            machineId: machineId,
            label: m['label'] as String? ?? '',
            reachable: m['reachable'] != false,
            environmentId: m['environmentId'] as String?,
          ),
    ];
  }

  final String machineId;
  final String label;
  final bool reachable;
  final String? environmentId;

  /// Linked machines answer no project reads: they list flat, newest first.
  bool get linked => environmentId != null;

  String get key => '$machineId|${environmentId ?? ''}';

  @override
  bool operator ==(Object other) =>
      other is ProjectsMachine &&
      other.label == label &&
      other.reachable == reachable &&
      other.machineId == machineId &&
      other.environmentId == environmentId;

  @override
  int get hashCode => Object.hash(label, reachable, machineId, environmentId);
}

@immutable
class ProjectStateCounts {
  const ProjectStateCounts({
    this.running = 0,
    this.waiting = 0,
    this.failed = 0,
    this.idle = 0,
  });

  factory ProjectStateCounts.fromJson(Object? raw) {
    final json = raw is Map<String, dynamic> ? raw : const <String, dynamic>{};
    int read(String key) => (json[key] as num?)?.toInt() ?? 0;
    return ProjectStateCounts(
      running: read('running'),
      waiting: read('waiting'),
      failed: read('failed'),
      idle: read('idle'),
    );
  }

  final int running;
  final int waiting;
  final int failed;
  final int idle;

  int of(ProjectThreadState state) => switch (state) {
    ProjectThreadState.running => running,
    ProjectThreadState.waiting => waiting,
    ProjectThreadState.failed => failed,
    ProjectThreadState.idle => idle,
  };

  ProjectStateCounts operator +(ProjectStateCounts other) => ProjectStateCounts(
    running: running + other.running,
    waiting: waiting + other.waiting,
    failed: failed + other.failed,
    idle: idle + other.idle,
  );
}

/// A project header: counts only. Its threads page in when expanded.
@immutable
class ProjectGroup {
  const ProjectGroup({
    required this.projectId,
    required this.project,
    required this.threadCount,
    required this.counts,
    this.latestUpdatedAt,
  });

  factory ProjectGroup.fromJson(Map<String, dynamic> json) => ProjectGroup(
    projectId: json['projectId'] as String,
    project: json['project'] as String? ?? '',
    threadCount: (json['threadCount'] as num?)?.toInt() ?? 0,
    counts: ProjectStateCounts.fromJson(json['counts']),
    latestUpdatedAt: DateTime.tryParse(
      json['latestUpdatedAt'] as String? ?? '',
    ),
  );

  /// `none` is the unassigned group's query id.
  static const unassignedId = 'none';

  final String projectId;
  final String project;
  final int threadCount;
  final ProjectStateCounts counts;
  final DateTime? latestUpdatedAt;

  bool get unassigned => projectId == unassignedId;
}

/// GET /threads/projects: a snapshot, refreshed on focus, resume or pull.
@immutable
class ProjectsOverview {
  const ProjectsOverview({
    required this.projects,
    required this.unassigned,
    this.cachedAt,
  });

  factory ProjectsOverview.fromJson(Map<String, dynamic> json) {
    final unassigned = json['unassigned'] as Map<String, dynamic>? ?? const {};
    return ProjectsOverview(
      projects: [
        for (final p in json['projects'] as List<dynamic>? ?? const [])
          ProjectGroup.fromJson(p as Map<String, dynamic>),
      ],
      unassigned: ProjectGroup(
        projectId: ProjectGroup.unassignedId,
        project: '',
        threadCount: (unassigned['threadCount'] as num?)?.toInt() ?? 0,
        counts: ProjectStateCounts.fromJson(unassigned['counts']),
      ),
    );
  }

  final List<ProjectGroup> projects;
  final ProjectGroup unassigned;

  /// Set when this came from the on-device cache rather than a live read.
  final DateTime? cachedAt;

  /// Projects newest activity first, the unassigned group last when it has
  /// threads.
  List<ProjectGroup> get groups => [
    ...projects,
    if (unassigned.threadCount > 0) unassigned,
  ];

  ProjectStateCounts get totals =>
      groups.fold(const ProjectStateCounts(), (sum, g) => sum + g.counts);
}

@immutable
class ProjectThread {
  const ProjectThread({
    required this.threadId,
    required this.title,
    required this.state,
    required this.updatedAt,
    required this.itemCount,
    this.projectId,
    this.project,
    this.seenItemCount,
  });

  factory ProjectThread.fromJson(Map<String, dynamic> json) => ProjectThread(
    threadId: json['threadId'] as String,
    title: json['title'] as String? ?? '',
    state: ProjectThreadState.parse(json['state']),
    updatedAt:
        DateTime.tryParse(json['updatedAt'] as String? ?? '') ??
        DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
    itemCount: (json['itemCount'] as num?)?.toInt() ?? 0,
    projectId: json['projectId'] as String?,
    project: json['project'] as String?,
    seenItemCount: (json['seenItemCount'] as num?)?.toInt(),
  );

  final String threadId;
  final String title;
  final ProjectThreadState state;
  final DateTime updatedAt;
  final int itemCount;
  final String? projectId;
  final String? project;
  final int? seenItemCount;

  ProjectThread withSeen(int seen) => ProjectThread(
    threadId: threadId,
    title: title,
    state: state,
    updatedAt: updatedAt,
    itemCount: itemCount,
    projectId: projectId,
    project: project,
    seenItemCount: seen,
  );

  /// Items the owner has not seen; null when nothing was ever seen, which the
  /// row shows as "new".
  int? get unread {
    final seen = seenItemCount;
    if (seen == null) return null;
    final count = itemCount - seen;
    return count > 0 ? count : 0;
  }
}

/// One page of GET /threads, newest first.
@immutable
class ThreadListPage {
  const ThreadListPage({
    required this.threads,
    required this.total,
    this.nextCursor,
    this.cachedAt,
  });

  factory ThreadListPage.fromJson(Map<String, dynamic> json) => ThreadListPage(
    threads: [
      for (final t in json['threads'] as List<dynamic>? ?? const [])
        ProjectThread.fromJson(t as Map<String, dynamic>),
    ],
    total: (json['total'] as num?)?.toInt() ?? 0,
    nextCursor: (json['nextCursor'] as num?)?.toInt(),
  );

  final List<ProjectThread> threads;
  final int total;
  final int? nextCursor;
  final DateTime? cachedAt;
}

/// The filters of one GET /threads read.
@immutable
class ProjectThreadQuery {
  const ProjectThreadQuery({
    this.projectId,
    this.state,
    this.search,
    this.cursor,
    this.limit = 50,
  }) : assert(limit > 0 && limit <= 50, 'limit is 1..50');

  /// [ProjectGroup.unassignedId] reads unassigned threads. Never sent for a
  /// linked machine.
  final String? projectId;
  final ProjectThreadState? state;
  final String? search;
  final int? cursor;
  final int limit;
}
