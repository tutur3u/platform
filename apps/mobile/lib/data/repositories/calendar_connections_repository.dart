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
    final response = await _api.getJson(
      '/api/v1/calendar/auth/accounts?wsId=$wsId',
    );
    final list = response['accounts'] as List<dynamic>? ?? [];
    return list
        .map((e) => CalendarAccount.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Soft-deletes the account identified by [accountId].
  ///
  /// This deactivates the token and disables all linked calendar connections.
  Future<void> disconnectAccount({
    required String accountId,
    required String wsId,
  }) async {
    await _api.deleteJson(
      '/api/v1/calendar/auth/accounts?accountId=$accountId&wsId=$wsId',
    );
  }

  // ── Connections ────────────────────────────────────────────────────

  /// Fetches all calendar connections for [wsId].
  Future<List<CalendarConnection>> getConnections(String wsId) async {
    final response = await _api.getJson(
      '/api/v1/calendar/connections?wsId=$wsId',
    );
    final list = response['connections'] as List<dynamic>? ?? [];
    return list
        .map((e) => CalendarConnection.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Toggles visibility of a calendar connection.
  Future<void> toggleConnection({
    required String connectionId,
    required bool isEnabled,
  }) async {
    await _api.patchJson(
      '/api/v1/calendar/connections',
      {'id': connectionId, 'isEnabled': isEnabled},
    );
  }

  // ── OAuth ──────────────────────────────────────────────────────────

  /// Returns the Google OAuth URL to open in an external browser.
  Future<String> getGoogleOAuthUrl(String wsId) async {
    final response = await _api.getJson(
      '/api/v1/calendar/auth?wsId=$wsId',
    );
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
