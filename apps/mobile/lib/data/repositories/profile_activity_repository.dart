import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/sources/api_client.dart';

class ProfileActivityRepository {
  ProfileActivityRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();
  final ApiClient _api;

  Future<Map<String, dynamic>> load(String workspaceId, {String? after}) =>
      _api.getJson(
        '/api/v1/workspaces/$workspaceId/profile-activity'
        '${after == null ? '' : '?after=${Uri.encodeComponent(after)}'}',
      );

  Future<void> setSharing(String workspaceId, {required bool sharing}) async {
    await _api.putJson(
      '/api/v1/users/me/workspaces/$workspaceId/configs/PROFILE_ACTIVITY_VISIBILITY',
      {'value': sharing ? 'workspace' : null},
    );
  }

  Future<TimeTrackerStats> sharedStats(
    String workspaceId,
    String userId,
    String timezone,
  ) async {
    final data = await _api.getJson(
      '/api/v1/workspaces/$workspaceId/profile-activity'
      '?userId=${Uri.encodeComponent(userId)}'
      '&timezone=${Uri.encodeComponent(timezone)}',
    );
    return TimeTrackerStats.fromJson(data['stats'] as Map<String, dynamic>);
  }

  void dispose() => _api.dispose();
}
