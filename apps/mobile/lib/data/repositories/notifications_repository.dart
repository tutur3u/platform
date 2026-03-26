import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/data/sources/api_client.dart';

class NotificationsRepository {
  NotificationsRepository({
    ApiClient? apiClient,
    bool ownsApiClient = false,
  }) : _apiClient = apiClient ?? ApiClient(),
       _ownsApiClient = apiClient == null || ownsApiClient;

  final ApiClient _apiClient;
  final bool _ownsApiClient;

  Future<NotificationsPage> fetchNotifications({
    String? wsId,
    bool unreadOnly = false,
    bool readOnly = false,
    int limit = 20,
    int offset = 0,
  }) async {
    final params = <String, String>{
      'limit': '$limit',
      'offset': '$offset',
      'unreadOnly': '$unreadOnly',
      'readOnly': '$readOnly',
      if (wsId != null) 'wsId': wsId,
    };

    final json = await _apiClient.getJson(
      NotificationEndpoints.notifications(params),
    );

    return NotificationsPage.fromJson(json);
  }

  Future<int> fetchUnreadCount({String? wsId}) async {
    final json = await _apiClient.getJson(
      NotificationEndpoints.unreadCount(wsId: wsId),
    );
    return json['count'] as int? ?? 0;
  }

  Future<void> markRead({
    required String id,
    required bool read,
  }) async {
    await _apiClient.patchJson(
      NotificationEndpoints.notification(id),
      {'read': read},
    );
  }

  Future<void> markAllRead({String? wsId}) async {
    await _apiClient.patchJson(NotificationEndpoints.base, {
      'action': 'mark_all_read',
      if (wsId != null) 'wsId': wsId,
    });
  }

  Future<void> updateMetadata({
    required String id,
    required Map<String, dynamic> metadata,
  }) async {
    await _apiClient.patchJson(
      NotificationEndpoints.metadata(id),
      metadata,
    );
  }

  Future<void> acceptWorkspaceInvite(String wsId) async {
    await _apiClient.postJson(
      NotificationEndpoints.acceptInvite(wsId),
      const {},
    );
  }

  Future<void> declineWorkspaceInvite(String wsId) async {
    await _apiClient.postJson(
      NotificationEndpoints.declineInvite(wsId),
      const {},
    );
  }

  void dispose() {
    if (_ownsApiClient) {
      _apiClient.dispose();
    }
  }
}
