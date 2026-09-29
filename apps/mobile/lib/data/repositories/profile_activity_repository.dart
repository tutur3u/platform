import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/sources/api_client.dart';

class ProfileActivityRepository {
  ProfileActivityRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();
  final ApiClient _api;

  Future<Map<String, dynamic>> load(String workspaceId, {String? after}) async {
    final data = await readThroughJson(
      api: _api,
      namespace: 'profile.activity',
      workspaceId: workspaceId,
      path:
          '/api/v1/workspaces/$workspaceId/profile-activity'
          '${after == null ? '' : '?after=${Uri.encodeComponent(after)}'}',
    );
    var sharing = data['sharing'];
    final path =
        '/api/v1/users/me/workspaces/$workspaceId/configs/PROFILE_ACTIVITY_VISIBILITY';
    for (final item in await OfflineMutationQueue.instance.listPending()) {
      if (item.feature == 'profile' &&
          item.workspaceId == workspaceId &&
          item.path == path) {
        sharing = item.payload?['value'] == 'workspace';
      }
    }
    return {...data, if (sharing != null) 'sharing': sharing};
  }

  Future<void> setSharing(String workspaceId, {required bool sharing}) async {
    final path =
        '/api/v1/users/me/workspaces/$workspaceId/configs/PROFILE_ACTIVITY_VISIBILITY';
    final payload = {'value': sharing ? 'workspace' : null};
    await queueOrSendVoid(
      feature: 'profile',
      method: 'PUT',
      path: path,
      workspaceId: workspaceId,
      entityId: workspaceId,
      payload: payload,
      send: () async {
        await _api.putJson(path, payload);
      },
    );
  }

  Future<TimeTrackerStats> sharedStats(
    String workspaceId,
    String userId,
    String timezone,
  ) async {
    final data = await readThroughJson(
      api: _api,
      namespace: 'profile.sharedStats',
      workspaceId: workspaceId,
      path:
          '/api/v1/workspaces/$workspaceId/profile-activity'
          '?userId=${Uri.encodeComponent(userId)}'
          '&timezone=${Uri.encodeComponent(timezone)}',
    );
    return TimeTrackerStats.fromJson(data['stats'] as Map<String, dynamic>);
  }

  void dispose() => _api.dispose();
}
