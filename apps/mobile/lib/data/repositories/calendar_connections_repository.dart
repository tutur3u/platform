import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/data/models/calendar_account.dart';
import 'package:mobile/data/models/calendar_connection.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Repository for calendar account connections and calendar visibility.
///
/// Calls the web API endpoints:
/// - `/api/v1/calendar/auth/accounts` — list / disconnect accounts
/// - `/api/v1/calendar/connections` — list / toggle calendar connections
/// - `/api/v1/calendar/auth` — get OAuth URL for Google
/// - `/api/v1/calendar/auth/microsoft` — get OAuth URL for Microsoft
class CalendarConnectionsRepository {
  CalendarConnectionsRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  // ── Accounts ───────────────────────────────────────────────────────

  /// Fetches all active connected accounts for [wsId].
  Future<List<CalendarAccount>> getAccounts(String wsId) async {
    final response = await readThroughJson(
      api: _api,
      namespace: 'calendar.accounts',
      workspaceId: wsId,
      path: '/api/v1/calendar/auth/accounts?wsId=$wsId',
    );
    final list = response['accounts'] as List<dynamic>? ?? [];
    return list
        .map((e) => CalendarAccount.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<bool> isDisconnectPending(String accountId, String wsId) async =>
      (await OfflineMutationQueue.instance.listPending()).any(
        (item) =>
            item.feature == 'calendar' &&
            item.method == 'DELETE' &&
            item.workspaceId == wsId &&
            item.entityId == accountId,
      );

  /// Soft-deletes the account identified by [accountId].
  ///
  /// This deactivates the token and disables all linked calendar connections.
  Future<void> disconnectAccount({
    required String accountId,
    required String wsId,
  }) async {
    final path =
        '/api/v1/calendar/auth/accounts?accountId=$accountId&wsId=$wsId';
    await queueOrSendVoid(
      feature: 'calendar',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: accountId,
      send: () async {
        await _api.deleteJson(path);
      },
    );
  }

  // ── Connections ────────────────────────────────────────────────────

  /// Fetches all calendar connections for [wsId].
  Future<List<CalendarConnection>> getConnections(String wsId) async {
    final response = await readThroughJson(
      api: _api,
      namespace: 'calendar.connections',
      workspaceId: wsId,
      path: '/api/v1/calendar/connections?wsId=$wsId',
    );
    final list = response['connections'] as List<dynamic>? ?? [];
    final pending = await OfflineMutationQueue.instance.listPending();
    final toggles = {
      for (final item in pending)
        if (item.feature == 'calendar' &&
            item.method == 'PATCH' &&
            item.workspaceId == wsId &&
            item.entityId != null)
          item.entityId!: item.payload?['isEnabled'] as bool?,
    };
    final disconnected = pending
        .where(
          (item) =>
              item.feature == 'calendar' &&
              item.method == 'DELETE' &&
              item.workspaceId == wsId,
        )
        .map((item) => item.entityId)
        .toSet();
    return list
        .map((e) => CalendarConnection.fromJson(e as Map<String, dynamic>))
        .map(
          (connection) => connection.copyWith(
            isEnabled: disconnected.contains(connection.authTokenId)
                ? false
                : toggles[connection.id],
          ),
        )
        .toList();
  }

  /// Toggles visibility of a calendar connection.
  Future<void> toggleConnection({
    required String connectionId,
    required bool isEnabled,
    required String wsId,
  }) async {
    const path = '/api/v1/calendar/connections';
    final payload = {'id': connectionId, 'isEnabled': isEnabled};
    await queueOrSendVoid(
      feature: 'calendar',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: connectionId,
      payload: payload,
      send: () async {
        await _api.patchJson(path, payload);
      },
    );
  }

  // ── OAuth ──────────────────────────────────────────────────────────

  /// Returns the Google OAuth URL to open in an external browser.
  Future<String> getGoogleOAuthUrl(String wsId) async {
    final response = await _api.getJson('/api/v1/calendar/auth?wsId=$wsId');
    return response['authUrl'] as String;
  }

  /// Returns the Microsoft OAuth URL to open in an external browser.
  Future<String> getMicrosoftOAuthUrl(String wsId) async {
    final response = await _api.getJson(
      '/api/v1/calendar/auth/microsoft?wsId=$wsId',
    );
    return response['authUrl'] as String;
  }

  void dispose() => _api.dispose();
}
