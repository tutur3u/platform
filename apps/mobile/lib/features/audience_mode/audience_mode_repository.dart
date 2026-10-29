import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/audience_mode/audience_mode.dart';

/// Reads and writes the three stored mode layers through existing
/// key-value config routes. No route or table is specific to modes.
class AudienceModeRepository {
  AudienceModeRepository({ApiClient? apiClient, OfflineMutationQueue? queue})
    : _api = apiClient ?? ApiClient(),
      _queue = queue;

  /// `user_workspace_configs` (override) and `user_configs` (account).
  static const userConfigId = 'MOBILE_AUDIENCE_MODE';

  /// `workspace_configs`, written by members with `manage_workspace_settings`.
  static const workspaceDefaultConfigId = 'MOBILE_DEFAULT_AUDIENCE_MODE';

  final ApiClient _api;
  final OfflineMutationQueue? _queue;

  static String overridePath(String wsId) =>
      '/api/v1/users/me/workspaces/${Uri.encodeComponent(wsId)}'
      '/configs/$userConfigId';

  static String workspaceDefaultPath(String wsId) =>
      '/api/v1/workspaces/${Uri.encodeComponent(wsId)}'
      '/settings/$workspaceDefaultConfigId';

  static const accountPath = '/api/v1/users/me/configs/$userConfigId';

  Future<AudienceMode?> loadOverride(String wsId) async =>
      AudienceMode.parse((await _api.getJson(overridePath(wsId)))['value']);

  /// The settings route answers 404 for an unset workspace config.
  Future<AudienceMode?> loadWorkspaceDefault(String wsId) async {
    try {
      final data = await _api.getJson(workspaceDefaultPath(wsId));
      return AudienceMode.parse(data['value']);
    } on ApiException catch (error) {
      if (error.statusCode == 404) return null;
      rethrow;
    }
  }

  Future<AudienceMode?> loadAccount() async =>
      AudienceMode.parse((await _api.getJson(accountPath))['value']);

  /// A config PUT is idempotent, so an offline write replays safely.
  Future<void> saveOverride(String wsId, AudienceMode? mode) =>
      _queuedPut(overridePath(wsId), wsId, mode);

  /// Without a workspace there is no queue scope, so the write goes direct.
  Future<void> saveAccount(String? wsId, AudienceMode? mode) async {
    if (wsId == null || wsId.isEmpty) {
      await _api.putJson(accountPath, {'value': mode?.wireValue});
      return;
    }
    await _queuedPut(accountPath, wsId, mode);
  }

  /// Online only: a workspace default changes every member's phone.
  Future<void> saveWorkspaceDefault(String wsId, AudienceMode? mode) async {
    await _api.putJson(workspaceDefaultPath(wsId), {'value': mode?.wireValue});
  }

  /// Values of this user's queued mode writes by path, latest last, so a
  /// refresh does not undo a change that has not reached the server yet.
  Future<Map<String, AudienceMode?>> pendingWrites(String wsId) async {
    final queue = _queue ?? OfflineMutationQueue.instance;
    final writes = <String, AudienceMode?>{};
    for (final item in await queue.listPending()) {
      if (item.feature != 'audience_mode' || item.method != 'PUT') continue;
      if (item.path != accountPath && item.path != overridePath(wsId)) {
        continue;
      }
      writes[item.path] = AudienceMode.parse(item.payload?['value']);
    }
    return writes;
  }

  Future<void> _queuedPut(String path, String wsId, AudienceMode? mode) {
    final payload = <String, dynamic>{'value': mode?.wireValue};
    return queueOrSendVoid(
      feature: 'audience_mode',
      method: 'PUT',
      path: path,
      workspaceId: wsId,
      entityId: path,
      payload: payload,
      replaySafe: true,
      queue: _queue,
      apiClient: _api,
      send: () async {
        await _api.putJson(path, payload);
      },
    );
  }
}
