import 'dart:async';

import 'package:mobile/features/mastermind/fleet/data/fleet_thread_repository.dart';
import 'package:mobile/features/mastermind/projects/data/fixture_reply_source.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/thread_models.dart';

/// In-memory Web responses of the exact wire shapes, parsed through the same
/// `fromJson` the live data layer uses. Linked machines answer slowly and
/// refuse project reads with 422, as the bridge does.
class FixtureProjectsRepository implements ProjectsRepository {
  FixtureProjectsRepository({
    DateTime? now,
    this.linkedLatency = const Duration(seconds: 4),
  }) : _now = now ?? DateTime.now().toUtc();

  final DateTime _now;
  final Duration linkedLatency;

  /// Failure to throw from the next read, then cleared.
  ProjectsFailureKind? failNext;

  /// Every read fails with `machine_offline` while set.
  bool offline = false;

  /// Every `projects` and `threads` read, for tests.
  final List<String> calls = [];

  /// First pages of unsearched lists, as the device cache keeps them.
  final Map<String, ThreadListPage> _firstPages = {};

  @override
  late final FleetThreadSource replySource = FixtureReplySource(
    stateOf: (threadId) => _anyThread(threadId)?.state,
    takeFailure: () {
      final failure = failNext;
      failNext = null;
      return failure;
    },
    now: _now,
  );

  @override
  Future<ThreadListPage?> cachedThreads(
    ProjectsMachine machine,
    ProjectThreadQuery query,
  ) async {
    if (clipProjectsSearch(query.search) != null) return null;
    final page = _firstPages[_listKey(machine, query)];
    if (page == null) return null;
    return ThreadListPage(
      threads: page.threads,
      total: page.total,
      nextCursor: page.nextCursor,
      cachedAt: _now,
    );
  }

  String _listKey(ProjectsMachine machine, ProjectThreadQuery query) =>
      '${machine.key}|${query.projectId ?? ''}|${query.state?.name ?? ''}';
  final Map<String, int> _seenCounts = {};
  final _seen = StreamController<ThreadSeenMark>.broadcast();

  static const bridgeId = 'm4-bridge';

  @override
  Stream<ThreadSeenMark> get seenMarks => _seen.stream;

  static const _projectSizes = [
    ('p_tuturuuu', 'tuturuuu', 5000),
    ('p_mastermind', 'mastermind', 14),
    ('p_t3code', 't3code', 9),
    ('p_docs', 'docs', 6),
  ];

  static const _titles = [
    'Ship the Projects screen',
    'Fix flaky calendar sync test',
    'Review the bridge thread read',
    'Migrate settings to Start',
    'Tighten reply receipts',
    'Audit mobile cache scope',
  ];

  @override
  Future<List<ProjectsMachine>> machines() async {
    _maybeFail();
    return ProjectsMachine.listFromJson({
      'machineId': bridgeId,
      'machines': [
        {'label': 'This machine', 'reachable': true},
        {'label': 'M4 Studio', 'environmentId': 'env_m4', 'reachable': true},
        {
          'label': 'Build box',
          'environmentId': 'env_build',
          'reachable': false,
        },
      ],
    });
  }

  @override
  Future<ProjectsOverview> projects(ProjectsMachine machine) async {
    calls.add('projects:${machine.environmentId ?? ''}');
    if (machine.linked) {
      throw const ProjectsException(
        ProjectsFailureKind.unsupportedForLinkedMachine,
      );
    }
    _maybeFail();
    Map<String, int> counts(String id) {
      final all = _bridgeThreads(id);
      return {
        for (final s in ProjectThreadState.values)
          s.name: all.where((t) => t.state == s).length,
      };
    }

    return ProjectsOverview.fromJson({
      'projects': [
        for (final (id, name, size) in _projectSizes)
          {
            'projectId': id,
            'project': name,
            'threadCount': size,
            'counts': counts(id),
            'latestUpdatedAt': _bridgeThreads(
              id,
            ).first.updatedAt.toIso8601String(),
          },
      ],
      'unassigned': {'threadCount': 4, 'counts': counts('none')},
    });
  }

  @override
  Future<ThreadListPage> threads(
    ProjectsMachine machine,
    ProjectThreadQuery query,
  ) async {
    calls.add(
      'threads:${machine.environmentId ?? ''}:${query.projectId ?? '-'}:'
      '${query.cursor ?? 0}',
    );
    if (machine.linked) {
      if (query.projectId == ProjectGroup.unassignedId) {
        throw const ProjectsException(
          ProjectsFailureKind.unsupportedForLinkedMachine,
        );
      }
      await Future<void>.delayed(linkedLatency);
    }
    _maybeFail();
    var all = machine.linked
        ? _linkedThreads(machine)
        : query.projectId == null
        ? [for (final (id, _, _) in _projectSizes) ..._bridgeThreads(id)]
        : _bridgeThreads(query.projectId!);
    if (query.projectId == null && !machine.linked) {
      all = [...all, ..._bridgeThreads('none')]
        ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    }
    final q = query.search?.trim().toLowerCase() ?? '';
    final filtered = all
        .where((t) => query.state == null || t.state == query.state)
        .where((t) => q.isEmpty || t.title.toLowerCase().contains(q))
        .toList();
    final start = query.cursor ?? 0;
    final end = (start + query.limit).clamp(0, filtered.length);
    final seenKey = machine.key;
    final page = ThreadListPage(
      threads: [
        for (final t in filtered.sublist(start.clamp(0, filtered.length), end))
          switch (_seenCounts['$seenKey|${t.threadId}']) {
            final int seen => t.withSeen(seen),
            null => t,
          },
      ],
      total: filtered.length,
      nextCursor: end < filtered.length ? end : null,
    );
    if (q.isEmpty && query.cursor == null) {
      _firstPages[_listKey(machine, query)] = page;
    }
    return page;
  }

  @override
  Future<ThreadTranscript> messages(
    ProjectsMachine machine,
    String threadId, {
    int? before,
  }) async {
    _maybeFail();
    final thread = _find(machine, threadId);
    if (thread == null) {
      throw const ProjectsException(ProjectsFailureKind.notFound);
    }
    final total = thread.itemCount;
    final end = before ?? total;
    final start = (end - 30).clamp(0, total);
    return ThreadTranscript.fromJson({
      'machineId': machine.machineId,
      'thread': {
        'threadId': threadId,
        'title': thread.title,
        'state': thread.state.name,
        'updatedAt': thread.updatedAt.toIso8601String(),
        'itemCount': total,
      },
      'messages': [
        for (var i = start; i < end; i++)
          {
            'position': i,
            'role': i.isEven ? 'assistant' : 'user',
            'text': i.isEven
                ? 'Step $i is green. The token [redacted] stays out of logs.'
                : 'Keep going with step ${i + 1}.',
            'truncated': i % 25 == 0,
            'at': _now
                .subtract(Duration(minutes: (total - i) * 3))
                .toIso8601String(),
          },
      ],
      'earlierPosition': start > 0 ? start : null,
    });
  }

  @override
  Future<bool> markRead(
    ProjectsMachine machine, {
    required String threadId,
    required int itemCount,
  }) async {
    _maybeFail();
    _seenCounts['${machine.key}|$threadId'] = itemCount;
    _seen.add((
      machineKey: machine.key,
      threadId: threadId,
      itemCount: itemCount,
    ));
    return true;
  }

  void _maybeFail() {
    if (offline) {
      throw const ProjectsException(ProjectsFailureKind.machineOffline);
    }
    final failure = failNext;
    if (failure == null) return;
    failNext = null;
    throw ProjectsException(failure);
  }

  /// A thread on any fixture machine.
  ProjectThread? _anyThread(String threadId) => [
    for (final (id, _, _) in _projectSizes) ..._bridgeThreads(id),
    ..._bridgeThreads('none'),
    for (final env in const ['env_m4', 'env_build'])
      ..._linkedThreads(
        ProjectsMachine(
          machineId: bridgeId,
          label: '',
          reachable: true,
          environmentId: env,
        ),
      ),
  ].where((t) => t.threadId == threadId).firstOrNull;

  ProjectThread? _find(ProjectsMachine machine, String threadId) {
    final pool = machine.linked
        ? _linkedThreads(machine)
        : [
            for (final (id, _, _) in _projectSizes) ..._bridgeThreads(id),
            ..._bridgeThreads('none'),
          ];
    return pool.where((t) => t.threadId == threadId).firstOrNull;
  }

  final Map<String, List<ProjectThread>> _cache = {};

  List<ProjectThread> _bridgeThreads(String projectId) =>
      _cache[projectId] ??= () {
        final entry = _projectSizes.where((p) => p.$1 == projectId).firstOrNull;
        final size = entry?.$3 ?? 4;
        final offset = _projectSizes.indexWhere((p) => p.$1 == projectId) + 1;
        return [
          for (var i = 0; i < size; i++)
            _thread(
              id: '${projectId}_$i',
              index: i,
              minutes: i * 9 + offset * 4,
              projectId: entry == null ? null : projectId,
              project: entry?.$2,
            ),
        ];
      }();

  List<ProjectThread> _linkedThreads(ProjectsMachine machine) =>
      _cache['linked:${machine.key}'] ??= [
        for (var i = 0; i < 70; i++)
          _thread(
            id: '${machine.environmentId}_$i',
            index: i,
            minutes: i * 11 + 2,
          ),
      ];

  ProjectThread _thread({
    required String id,
    required int index,
    required int minutes,
    String? projectId,
    String? project,
  }) => ProjectThread.fromJson({
    'threadId': id,
    'title': '${_titles[index % _titles.length]} ${index + 1}',
    'projectId': ?projectId,
    'project': ?project,
    'state': switch (index) {
      0 || 3 => 'running',
      1 => 'waiting',
      5 => 'failed',
      _ => 'idle',
    },
    'updatedAt': _now.subtract(Duration(minutes: minutes)).toIso8601String(),
    'itemCount': 40 + index % 7,
    if (index % 4 != 2) 'seenItemCount': 40 + (index % 3 == 0 ? 0 : index % 7),
  });
}
