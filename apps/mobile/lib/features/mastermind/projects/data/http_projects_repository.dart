import 'dart:async';

import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/thread_models.dart';

/// Owner-only fleet thread routes on Web.
///
/// Every thread route names the bridge machine, resolved from
/// `/fleet/live` (the first connected machine, else the first listed) each
/// time the machine list is read. GET /threads may ignore `projectId` and
/// `state`, so rows are kept in scope here and further pages are read until
/// a page of [pageSize] in-scope rows, the end, or [maxScanReads] reads.
class HttpProjectsRepository implements ProjectsRepository {
  HttpProjectsRepository({ApiClient? api}) : _api = api ?? ApiClient();

  static const _base = '/api/v1/mastermind/fleet';
  static const pageSize = 50;
  static const maxScanReads = 4;
  static final _machineId = RegExp(r'^[a-z0-9][a-z0-9._-]{0,63}$');

  final ApiClient _api;
  final _seen = StreamController<ThreadSeenMark>.broadcast();

  @override
  Stream<ThreadSeenMark> get seenMarks => _seen.stream;

  @override
  Future<List<ProjectsMachine>> machines() => _guard(() async {
    final live = await _api.getJson('$_base/live');
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
    final json = await _api.getJson(
      _path('/threads/machines', {'machineId': bridge.id}),
    );
    return ProjectsMachine.listFromJson(json);
  });

  /// A 404 here is the route not being deployed yet; the caller lists
  /// flat and asks again on a later visit.
  @override
  Future<ProjectsOverview> projects(ProjectsMachine machine) async {
    if (machine.linked) {
      throw const ProjectsException(
        ProjectsFailureKind.unsupportedForLinkedMachine,
      );
    }
    return await _guard(
      () async => ProjectsOverview.fromJson(
        await _api.getJson(
          _path('/threads/projects', {'machineId': machine.machineId}),
        ),
      ),
    );
  }

  @override
  Future<ThreadListPage> threads(
    ProjectsMachine machine,
    ProjectThreadQuery query,
  ) => _guard(() async {
    final search = clipProjectsSearch(query.search);
    final kept = <ProjectThread>[];
    var next = query.cursor;
    var total = 0;
    for (var reads = 0; reads < maxScanReads; reads++) {
      final page = ThreadListPage.fromJson(
        await _api.getJson(
          _path('/threads', {
            ..._machine(machine),
            if (search != null && search.isNotEmpty) 'q': search,
            // A linked machine answers 422 to `none`; that scope is kept
            // here instead.
            if (query.projectId case final projectId?
                when !(machine.linked &&
                    projectId == ProjectGroup.unassignedId))
              'projectId': projectId,
            if (query.state case final state?) 'state': state.name,
            'cursor': ?next?.toString(),
            'limit': '$pageSize',
          }),
        ),
      );
      kept.addAll(page.threads.where((t) => inProjectsScope(query, t)));
      total = page.total;
      next = page.nextCursor;
      if (next == null || kept.length >= pageSize) break;
    }
    return ThreadListPage(threads: kept, total: total, nextCursor: next);
  });

  @override
  Future<ThreadTranscript> messages(
    ProjectsMachine machine,
    String threadId, {
    int? before,
  }) => _guard(() async {
    final json = await _api.getJson(
      _path('/threads/messages', {
        ..._machine(machine),
        'threadId': threadId,
        'before': ?before?.toString(),
      }),
    );
    return ThreadTranscript.fromJson(json);
  });

  @override
  Future<bool> markRead(
    ProjectsMachine machine, {
    required String threadId,
    required int itemCount,
  }) async {
    final json = await _guard(
      () => _api.postJson('$_base/threads/read', {
        ..._machine(machine),
        'threadId': threadId,
        'itemCount': itemCount,
      }),
    );
    if (json['saved'] != true) return false;
    _seen.add((
      machineKey: machine.key,
      threadId: threadId,
      itemCount: itemCount,
    ));
    return true;
  }

  @override
  Future<ReplyReceipt> reply(
    ProjectsMachine machine, {
    required String threadId,
    required String text,
    required String idempotencyKey,
  }) => _guard(() async {
    // The key travels in the body: ApiClient owns the request headers, and
    // Web reads the body key when the header is absent.
    final json = await _api.postJson('$_base/replies', {
      ..._machine(machine),
      'threadId': threadId,
      'text': text,
      'idempotencyKey': idempotencyKey,
    });
    return ReplyReceipt.fromJson(json);
  });

  @override
  Future<ReplyReceipt?> receipt(ProjectsMachine machine, String replyId) async {
    try {
      return await _guard(
        () async => ReplyReceipt.fromJson(
          await _api.getJson('$_base/replies/${Uri.encodeComponent(replyId)}'),
        ),
      );
    } on ProjectsException catch (error) {
      if (error.kind == ProjectsFailureKind.notFound) return null;
      rethrow;
    }
  }

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

  Map<String, String> _machine(ProjectsMachine machine) => {
    'machineId': machine.machineId,
    'environmentId': ?machine.environmentId,
  };

  String _path(String route, Map<String, String> query) =>
      Uri(path: '$_base$route', queryParameters: query).toString();

  static Future<T> _guard<T>(Future<T> Function() read) async {
    try {
      return await read();
    } on ProjectsException {
      rethrow;
    } on ApiException catch (error) {
      throw ProjectsException(failureOf(error));
    } on Object {
      throw const ProjectsException(ProjectsFailureKind.unavailable);
    }
  }

  /// Web's status and closed-set error code, reduced to a category.
  static ProjectsFailureKind failureOf(ApiException error) =>
      switch ((error.statusCode, error.message)) {
        (503, 'machine_offline') => ProjectsFailureKind.machineOffline,
        (504, _) => ProjectsFailureKind.timeout,
        (404, _) => ProjectsFailureKind.notFound,
        (401, 'mfa_required') => ProjectsFailureKind.mfaRequired,
        (422, 'invalid_query') => ProjectsFailureKind.invalid,
        (401 || 403, _) => ProjectsFailureKind.forbidden,
        (429, _) => ProjectsFailureKind.rateLimited,
        (422, 'unsupported_for_linked_machine') =>
          ProjectsFailureKind.unsupportedForLinkedMachine,
        _ => ProjectsFailureKind.unavailable,
      };
}
