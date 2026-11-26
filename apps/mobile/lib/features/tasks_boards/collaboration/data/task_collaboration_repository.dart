import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_collaboration_models.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_snapshot.dart';

/// The task comments, linked resources, timeline and revert routes, which
/// the API client sends to the tasks origin. Each route checks the caller's
/// task access itself; nothing here is cached, as every view reads fresh.
class TaskCollaborationRepository {
  TaskCollaborationRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  static String _task(String wsId, String taskId) =>
      '/api/v1/workspaces/${Uri.encodeComponent(wsId)}/tasks/'
      '${Uri.encodeComponent(taskId)}';

  static String _query(Map<String, String?> values) {
    final entries = {
      for (final entry in values.entries)
        if (entry.value != null) entry.key: entry.value!,
    };
    return entries.isEmpty ? '' : '?${Uri(queryParameters: entries).query}';
  }

  /// Comments oldest first, as web lists them (up to [limit]).
  Future<List<TaskComment>> listComments(
    String wsId,
    String taskId, {
    int limit = 100,
  }) async {
    final json = await _api.getJson(
      '${_task(wsId, taskId)}/comments${_query({'limit': '$limit'})}',
    );
    return [
      for (final row in json['comments'] as List? ?? const [])
        if (row is Map) TaskComment.fromJson(Map<String, dynamic>.from(row)),
    ];
  }

  Future<TaskComment> addComment(
    String wsId,
    String taskId,
    String body,
  ) async {
    final json = await _api.postJson('${_task(wsId, taskId)}/comments', {
      'body': body,
    });
    return TaskComment.fromJson(_record(json, 'comment'));
  }

  /// Only the author may edit; the route refuses anyone else.
  Future<TaskComment> editComment(
    String wsId,
    String taskId,
    String commentId,
    String body,
  ) async {
    final json = await _api.patchJson(
      '${_task(wsId, taskId)}/comments/${Uri.encodeComponent(commentId)}',
      {'body': body},
    );
    return TaskComment.fromJson(_record(json, 'comment'));
  }

  Future<void> deleteComment(String wsId, String taskId, String commentId) =>
      _api.deleteJson(
        '${_task(wsId, taskId)}/comments/${Uri.encodeComponent(commentId)}',
      );

  /// Linked resources, legacy task links included.
  Future<List<TaskLink>> listLinks(String wsId, String taskId) async {
    final json = await _api.getJson('${_task(wsId, taskId)}/links');
    return [
      for (final row in json['links'] as List? ?? const [])
        if (row is Map) TaskLink.fromJson(Map<String, dynamic>.from(row)),
    ];
  }

  /// Adds an https link; the server reads GitHub pull request, commit and
  /// issue addresses into their kind.
  Future<TaskLink> addLink(String wsId, String taskId, String url) async {
    final json = await _api.postJson('${_task(wsId, taskId)}/links', {
      'url': url,
    });
    return TaskLink.fromJson(_record(json, 'link'));
  }

  Future<void> removeLink(String wsId, String taskId, String linkId) =>
      _api.deleteJson(
        '${_task(wsId, taskId)}/links/${Uri.encodeComponent(linkId)}',
      );

  /// The merged task timeline, newest first.
  Future<TaskPage<TaskTimelineEvent>> listTimeline(
    String wsId,
    String taskId, {
    String? cursor,
    int limit = 50,
  }) async {
    final json = await _api.getJson(
      '${_task(wsId, taskId)}/timeline'
      '${_query({'cursor': cursor, 'limit': '$limit'})}',
    );
    return TaskPage(
      items: [
        for (final row in json['events'] as List? ?? const [])
          if (row is Map)
            TaskTimelineEvent.fromJson(Map<String, dynamic>.from(row)),
      ],
      nextCursor: json['nextCursor']?.toString(),
    );
  }

  /// The task as it was before history entry [historyId].
  Future<TaskSnapshot> snapshot(
    String wsId,
    String taskId,
    String historyId,
  ) async {
    final json = await _api.getJson(
      '${_task(wsId, taskId)}/snapshot/${Uri.encodeComponent(historyId)}',
    );
    return TaskSnapshot.fromJson(
      Map<String, dynamic>.from(json['snapshot'] as Map? ?? const {}),
    );
  }

  /// Restores [fields] to their value before [historyId]; the server
  /// records the revert as a new history entry.
  Future<void> revert(
    String wsId,
    String taskId,
    String historyId,
    List<TaskRevertField> fields,
  ) => _api.postJson('${_task(wsId, taskId)}/revert', {
    'historyId': historyId,
    'fields': [for (final field in fields) field.wire],
  });
}

/// The object under [key], or a [FormatException] when the route sent none.
Map<String, dynamic> _record(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is Map) return Map<String, dynamic>.from(value);
  throw FormatException('Missing $key in the response');
}
