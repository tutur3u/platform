import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/data/sources/api_client.dart';

class NotificationsRepository {
  NotificationsRepository({ApiClient? apiClient, bool ownsApiClient = false})
    : _apiClient = apiClient ?? ApiClient(),
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

    final json = await readThroughJson(
      api: _apiClient,
      namespace: 'notifications.feed',
      workspaceId: wsId ?? 'personal',
      path: NotificationEndpoints.notifications(params),
    );
    final source = (json['notifications'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(Map<String, dynamic>.from)
        .toList();
    final rows = {for (final row in source) row['id'] as String: row};
    var hasPendingReadChange = false;
    for (final item in await OfflineMutationQueue.instance.listPending()) {
      if (item.feature != 'notifications') continue;
      if (item.path == NotificationEndpoints.base &&
          item.payload?['action'] == 'mark_all_read' &&
          (item.payload?['wsId'] == null || item.payload?['wsId'] == wsId)) {
        hasPendingReadChange = true;
        for (final row in rows.values) {
          row['read_at'] = DateTime.now().toUtc().toIso8601String();
        }
      } else if (item.path ==
              NotificationEndpoints.notification(item.entityId ?? '') &&
          rows.containsKey(item.entityId)) {
        hasPendingReadChange = true;
        rows[item.entityId]!['read_at'] = item.payload?['read'] == true
            ? DateTime.now().toUtc().toIso8601String()
            : null;
      }
    }
    final visible = rows.values
        .where((row) {
          if (hasPendingReadChange && unreadOnly && row['read_at'] != null) {
            return false;
          }
          if (hasPendingReadChange && readOnly && row['read_at'] == null) {
            return false;
          }
          return true;
        })
        .toList(growable: false);
    return NotificationsPage.fromJson({
      ...json,
      'notifications': visible,
      'count':
          ((json['count'] as int? ?? source.length) -
                  source.length +
                  visible.length)
              .clamp(0, 1 << 30),
    });
  }

  Future<int> fetchUnreadCount({String? wsId}) async {
    final json = await readThroughJson(
      api: _apiClient,
      namespace: 'notifications.unreadCount',
      workspaceId: wsId ?? 'personal',
      path: NotificationEndpoints.unreadCount(wsId: wsId),
    );
    final pending = await OfflineMutationQueue.instance.listPending();
    if (pending.any(
      (item) =>
          item.feature == 'notifications' &&
          item.path == NotificationEndpoints.base &&
          item.payload?['action'] == 'mark_all_read' &&
          (item.payload?['wsId'] == null || item.payload?['wsId'] == wsId),
    )) {
      return 0;
    }
    return json['count'] as int? ?? 0;
  }

  Future<void> markRead({required String id, required bool read}) async {
    final path = NotificationEndpoints.notification(id);
    final payload = {'read': read};
    await queueOrSendVoid(
      feature: 'notifications',
      method: 'PATCH',
      path: path,
      workspaceId: 'personal',
      entityId: id,
      payload: payload,
      send: () async {
        await _apiClient.patchJson(path, payload);
      },
    );
  }

  Future<int> archiveViewedMailThread({
    required String mailboxId,
    required String threadId,
  }) async {
    const path = NotificationEndpoints.viewedMailThread;
    final payload = {'mailboxId': mailboxId, 'threadId': threadId};
    return await queueOrSendValue<int>(
      feature: 'notifications',
      method: 'POST',
      path: path,
      workspaceId: 'personal',
      entityId: threadId,
      payload: payload,
      pendingValue: (_) => 0,
      send: () async =>
          (await _apiClient.postJson(path, payload))['archived'] as int? ?? 0,
    );
  }

  Future<void> markAllRead({String? wsId}) async {
    final payload = <String, dynamic>{
      'action': 'mark_all_read',
      if (wsId != null) 'wsId': wsId,
    };
    await queueOrSendVoid(
      feature: 'notifications',
      method: 'PATCH',
      path: NotificationEndpoints.base,
      workspaceId: 'personal',
      payload: payload,
      send: () async {
        await _apiClient.patchJson(NotificationEndpoints.base, payload);
      },
    );
  }

  Future<void> updateMetadata({
    required String id,
    required Map<String, dynamic> metadata,
  }) async {
    final path = NotificationEndpoints.metadata(id);
    await queueOrSendVoid(
      feature: 'notifications',
      method: 'PATCH',
      path: path,
      workspaceId: 'personal',
      entityId: id,
      payload: metadata,
      send: () async {
        await _apiClient.patchJson(path, metadata);
      },
    );
  }

  Future<void> acceptWorkspaceInvite(String wsId) async {
    final path = NotificationEndpoints.acceptInvite(wsId);
    await queueOrSendVoid(
      feature: 'notifications',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      entityId: wsId,
      payload: const {},
      send: () async {
        await _apiClient.postJson(path, const {});
      },
    );
  }

  Future<void> declineWorkspaceInvite(String wsId) async {
    final path = NotificationEndpoints.declineInvite(wsId);
    await queueOrSendVoid(
      feature: 'notifications',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      entityId: wsId,
      payload: const {},
      send: () async {
        await _apiClient.postJson(path, const {});
      },
    );
  }

  void dispose() {
    if (_ownsApiClient) {
      _apiClient.dispose();
    }
  }
}
