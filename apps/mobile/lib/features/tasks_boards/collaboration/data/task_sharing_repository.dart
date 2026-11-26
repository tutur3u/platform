import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_sharing_models.dart';

/// Task and board sharing on the tasks origin: the task's share link and
/// invites, and the board's public link and guest invites. The routes check
/// workspace membership and manage rights themselves.
class TaskSharingRepository {
  TaskSharingRepository({ApiClient? apiClient, String? shareOrigin})
    : _api = apiClient ?? ApiClient(),
      _shareOrigin = shareOrigin;

  final ApiClient _api;
  final String? _shareOrigin;

  String get _origin =>
      (_shareOrigin ?? ApiConfig.tasksBaseUrl).replaceFirst(RegExp(r'/+$'), '');

  static String _task(String wsId, String taskId) =>
      '/api/v1/workspaces/${Uri.encodeComponent(wsId)}/tasks/'
      '${Uri.encodeComponent(taskId)}';

  static String _board(String wsId, String boardId) =>
      '/api/v1/workspaces/${Uri.encodeComponent(wsId)}/task-boards/'
      '${Uri.encodeComponent(boardId)}';

  /// The address web copies for a task share link.
  String taskShareUrl(String code) =>
      '$_origin/shared/task/${Uri.encodeComponent(code)}';

  /// The address web copies for a board's public link.
  String boardPublicUrl(String code, {required String locale}) =>
      '$_origin/$locale/shared/task-boards/${Uri.encodeComponent(code)}';

  /// The task's share link; the route creates it on first read.
  Future<TaskShareLink> taskShareLink(String wsId, String taskId) async {
    final json = await _api.getJson('${_task(wsId, taskId)}/share-links');
    return TaskShareLink.fromJson(_record(json, 'shareLink'));
  }

  /// Changes who the link admits. The route allows these only in the
  /// internal workspace, and invite-only turns public access off.
  Future<TaskShareLink> updateTaskShareLink(
    String wsId,
    String taskId, {
    bool? publicAccess,
    bool? requiresInvite,
  }) async {
    final json = await _api.patchJson('${_task(wsId, taskId)}/share-links', {
      if (publicAccess != null) 'publicAccess': publicAccess ? 'view' : 'none',
      if (requiresInvite != null) 'requiresInvite': requiresInvite,
    });
    return TaskShareLink.fromJson(_record(json, 'shareLink'));
  }

  /// Revokes the link; the next read issues a new code.
  Future<void> revokeTaskShareLink(String wsId, String taskId, String linkId) =>
      _api.deleteJson(
        '${_task(wsId, taskId)}/share-links?id=${Uri.encodeComponent(linkId)}',
      );

  Future<List<ShareGrant>> taskShares(String wsId, String taskId) async {
    final json = await _api.getJson('${_task(wsId, taskId)}/shares');
    return [
      for (final row in json['shares'] as List? ?? const [])
        if (row is Map) ShareGrant.fromTaskJson(Map<String, dynamic>.from(row)),
    ];
  }

  /// Invites [email] to view the task, as web does.
  Future<void> addTaskShare(String wsId, String taskId, String email) =>
      _api.postJson('${_task(wsId, taskId)}/shares', {
        'email': email,
        'permission': SharePermission.view.name,
      });

  Future<void> updateTaskShare(
    String wsId,
    String taskId,
    String shareId,
    SharePermission permission,
  ) => _api.patchJson('${_task(wsId, taskId)}/shares', {
    'id': shareId,
    'permission': permission.name,
  });

  Future<void> removeTaskShare(String wsId, String taskId, String shareId) =>
      _api.deleteJson(
        '${_task(wsId, taskId)}/shares?id=${Uri.encodeComponent(shareId)}',
      );

  /// The board's public link, or null while it is disabled.
  Future<BoardPublicLink?> boardPublicLink(String wsId, String boardId) async {
    final json = await _api.getJson('${_board(wsId, boardId)}/public-link');
    final link = json['publicLink'];
    return link is Map
        ? BoardPublicLink.fromJson(Map<String, dynamic>.from(link))
        : null;
  }

  Future<BoardPublicLink> enableBoardPublicLink(
    String wsId,
    String boardId,
  ) async {
    final json = await _api.postJson(
      '${_board(wsId, boardId)}/public-link',
      const {},
    );
    return BoardPublicLink.fromJson(_record(json, 'publicLink'));
  }

  Future<void> disableBoardPublicLink(String wsId, String boardId) =>
      _api.deleteJson('${_board(wsId, boardId)}/public-link');

  Future<List<ShareGrant>> boardShares(String wsId, String boardId) async {
    final json = await _api.getJson('${_board(wsId, boardId)}/shares');
    return [
      for (final row in json['shares'] as List? ?? const [])
        if (row is Map)
          ShareGrant.fromBoardJson(Map<String, dynamic>.from(row)),
    ];
  }

  Future<void> addBoardShare(
    String wsId,
    String boardId,
    String email,
    SharePermission permission,
  ) => _api.postJson('${_board(wsId, boardId)}/shares', {
    'email': email,
    'permission': permission.name,
  });

  Future<void> updateBoardShare(
    String wsId,
    String boardId,
    String shareId,
    SharePermission permission,
  ) => _api.patchJson('${_board(wsId, boardId)}/shares', {
    'shareId': shareId,
    'permission': permission.name,
  });

  Future<void> removeBoardShare(String wsId, String boardId, String shareId) =>
      _api.deleteJson(
        '${_board(wsId, boardId)}/shares'
        '?shareId=${Uri.encodeComponent(shareId)}',
      );
}

/// The object under [key], or a [FormatException] when the route sent none.
Map<String, dynamic> _record(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is Map) return Map<String, dynamic>.from(value);
  throw FormatException('Missing $key in the response');
}
