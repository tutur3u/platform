import 'dart:async';

import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_cache.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_repository.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/thread_models.dart';

/// The Projects screen over the fleet thread routes: [FleetThreadSource]
/// does the HTTP, this maps its models to the screen's. The bridge machine
/// is the first connected one `/fleet/live` lists, else the first, read
/// each time the machine list is. First pages of unsearched lists are kept
/// in [cache] for the offline view.
class HttpProjectsRepository implements ProjectsRepository {
  HttpProjectsRepository({
    ApiClient? api,
    FleetThreadSource? source,
    FleetThreadCache? cache,
    String? Function()? userId,
  }) : this._(api ?? ApiClient(), source, cache, userId);

  HttpProjectsRepository._(
    ApiClient api,
    FleetThreadSource? source,
    this.cache,
    this._userId,
  ) : _api = api,
      replySource = source ?? FleetThreadRepository(api: api);

  static final _machineId = RegExp(r'^[a-z0-9][a-z0-9._-]{0,63}$');

  final ApiClient _api;
  final FleetThreadCache? cache;

  /// The signed-in account. [FleetThreadCache.write] files a page under
  /// whoever is signed in when it runs, so a page is cached only when the
  /// account that started its read is still the one signed in.
  final String? Function()? _userId;

  @override
  final FleetThreadSource replySource;
  FleetThreadSource get _source => replySource;
  final _seen = StreamController<ThreadSeenMark>.broadcast();

  @override
  Stream<ThreadSeenMark> get seenMarks => _seen.stream;

  @override
  Future<List<ProjectsMachine>> machines() => _guard(() async {
    final live = await _api.getJson('/api/v1/mastermind/fleet/live');
    final listed = [
      for (final raw in live['machines'] as List<dynamic>? ?? const [])
        if (raw case {
          'machineId': final String id,
        } when _machineId.hasMatch(id))
          (id: id, connected: raw['connected'] == true),
    ];
    final bridge =
        listed.where((m) => m.connected).firstOrNull ?? listed.firstOrNull;
    if (bridge == null) {
      throw const ProjectsException(ProjectsFailureKind.machineOffline);
    }
    final machines = await _source.machines(bridge.id);
    return [
      for (final m in machines.machines)
        ProjectsMachine(
          machineId: machines.machineId,
          label: m.label,
          reachable: m.reachable,
          environmentId: m.environmentId,
        ),
    ];
  });

  /// A 404 is the route not being deployed yet; the caller lists flat and
  /// asks again on its next read.
  @override
  Future<ProjectsOverview> projects(ProjectsMachine machine) {
    if (machine.linked) {
      throw const ProjectsException(
        ProjectsFailureKind.unsupportedForLinkedMachine,
      );
    }
    return _guard(() async {
      final read = await _source.projects(machine.machineId);
      ProjectStateCounts counts(FleetStateCounts c) => ProjectStateCounts(
        running: c.running,
        waiting: c.waiting,
        failed: c.failed,
        idle: c.idle,
      );
      return ProjectsOverview(
        projects: [
          for (final p in read.projects)
            ProjectGroup(
              projectId: p.projectId,
              project: p.name,
              threadCount: p.counts.threadCount,
              counts: counts(p.counts),
              latestUpdatedAt: p.latestUpdatedAt,
            ),
        ],
        unassigned: ProjectGroup(
          projectId: ProjectGroup.unassignedId,
          project: '',
          threadCount: read.unassigned.threadCount,
          counts: counts(read.unassigned),
        ),
      );
    });
  }

  /// One read per page: Web filters by `projectId` and `state`, and its
  /// `total` and `nextCursor` count the filtered set. [inProjectsScope]
  /// stays as a guard.
  @override
  Future<ThreadListPage> threads(
    ProjectsMachine machine,
    ProjectThreadQuery query,
  ) => _guard(() async {
    final search = clipProjectsSearch(query.search);
    // A linked machine answers 422 to `none`; that scope is kept here.
    final projectId =
        machine.linked && query.projectId == ProjectGroup.unassignedId
        ? null
        : query.projectId;
    final owner = _userId?.call();
    final read = await _source.threads(
      machineId: machine.machineId,
      environmentId: machine.environmentId,
      query: search,
      projectId: projectId,
      state: _fleetState(query.state),
      cursor: query.cursor,
      limit: query.limit,
    );
    if (search == null && query.cursor == null && owner == _userId?.call()) {
      unawaited(cache?.write(_listKey(machine, query), read));
    }
    return _page(read, query);
  });

  @override
  Future<ThreadListPage?> cachedThreads(
    ProjectsMachine machine,
    ProjectThreadQuery query,
  ) async {
    if (clipProjectsSearch(query.search) != null) return null;
    final cached = await cache?.read(_listKey(machine, query));
    if (cached == null) return null;
    return _page(cached.page, query, cachedAt: cached.savedAt);
  }

  @override
  Future<ThreadTranscript> messages(
    ProjectsMachine machine,
    String threadId, {
    int? before,
  }) => _guard(() async {
    final read = await _source.messages(
      machineId: machine.machineId,
      environmentId: machine.environmentId,
      threadId: threadId,
      before: before,
    );
    return ThreadTranscript(
      thread: _thread(read.thread),
      messages: [
        for (final m in read.messages)
          ThreadMessage(
            position: m.position,
            role: m.role == FleetMessageRole.user
                ? ThreadMessageRole.user
                : ThreadMessageRole.assistant,
            text: m.text,
            truncated: m.truncated,
            at: m.at ?? DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
          ),
      ],
      earlierPosition: read.earlierPosition,
    );
  });

  /// [FleetThreadSource.markRead] completes only once Web answered; that
  /// answer is taken as saved.
  @override
  Future<bool> markRead(
    ProjectsMachine machine, {
    required String threadId,
    required int itemCount,
  }) async {
    await _guard(
      () => _source.markRead(
        machineId: machine.machineId,
        environmentId: machine.environmentId,
        threadId: threadId,
        itemCount: itemCount,
      ),
    );
    _seen.add((
      machineKey: machine.key,
      threadId: threadId,
      itemCount: itemCount,
    ));
    return true;
  }

  String _listKey(ProjectsMachine machine, ProjectThreadQuery query) =>
      fleetThreadListKey(
        machineId: machine.machineId,
        environmentId: machine.environmentId,
        projectId: query.projectId,
        state: _fleetState(query.state),
      );

  ThreadListPage _page(
    FleetThreadPage page,
    ProjectThreadQuery query, {
    DateTime? cachedAt,
  }) => ThreadListPage(
    threads: [
      for (final t in page.threads)
        if (inProjectsScope(query, _thread(t))) _thread(t),
    ],
    total: page.total,
    nextCursor: page.nextCursor,
    cachedAt: cachedAt,
  );

  static ProjectThread _thread(FleetThread t) => ProjectThread(
    threadId: t.threadId,
    title: t.title,
    state: ProjectThreadState.parse(t.state.name),
    updatedAt:
        t.updatedAt ?? DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
    itemCount: t.itemCount,
    projectId: t.projectId,
    project: t.project,
    seenItemCount: t.seenItemCount,
  );

  static FleetThreadState? _fleetState(ProjectThreadState? state) =>
      state == null ? null : FleetThreadState.values.byName(state.name);

  /// The row matches the query's state, and its project, with
  /// [ProjectGroup.unassignedId] meaning no project.
  static bool inProjectsScope(ProjectThreadQuery query, ProjectThread row) {
    if (query.state != null && row.state != query.state) return false;
    final projectId = query.projectId;
    if (projectId == null) return true;
    return projectId == ProjectGroup.unassignedId
        ? row.projectId == null || row.projectId!.isEmpty
        : row.projectId == projectId;
  }

  static Future<T> _guard<T>(Future<T> Function() read) async {
    try {
      return await read();
    } on ProjectsException {
      rethrow;
    } on Object catch (error) {
      throw ProjectsException(
        projectsFailureOf(FleetThreadException.from(error)),
      );
    }
  }
}
