import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Validates a saved session before passing it to the shared auth client.
Session? readStoredSession(StoredAuthAccount account) {
  final raw = account.sessionJson;
  if (raw == null) return null;
  final parsed = jsonDecode(raw);
  if (parsed is! Map<String, dynamic>) return null;
  final session = Session.fromJson(parsed);
  if (session != null && session.user.id != account.id) {
    throw const AuthException('Saved session belongs to a different account');
  }
  return session;
}

/// Exchanges a stored refresh token without mutating the active SDK session.
/// GoTrue's shared client drops its current session on terminal refresh errors.
Future<Session?> refreshStoredSession({
  required Uri authUrl,
  required String apiKey,
  required String refreshToken,
  http.Client? httpClient,
}) async {
  if (refreshToken.trim().isEmpty) return null;
  final client = httpClient ?? http.Client();
  try {
    final request =
        http.Request(
            'POST',
            authUrl.replace(
              path: '${authUrl.path}/token',
              queryParameters: {'grant_type': 'refresh_token'},
            ),
          )
          ..followRedirects = false
          ..headers.addAll({
            'apikey': apiKey,
            'Content-Type': 'application/json',
          })
          ..body = jsonEncode({'refresh_token': refreshToken});
    final response = await client
        .send(request)
        .then(http.Response.fromStream)
        .timeout(const Duration(seconds: 12));
    if (response.statusCode == 400 ||
        response.statusCode == 401 ||
        response.statusCode == 403) {
      final payload = jsonDecode(response.body);
      if (payload is Map<String, dynamic> &&
          const {
            'invalid_grant',
            'refresh_token_not_found',
            'refresh_token_already_used',
            'session_not_found',
            'session_expired',
            'session_revoked',
          }.contains(
            payload['error_code'] ?? payload['code'] ?? payload['error'],
          )) {
        return null;
      }
    }
    if (response.statusCode != 200) {
      throw const AuthException('Saved session refresh failed');
    }
    final payload = jsonDecode(response.body);
    if (payload is! Map<String, dynamic>) {
      throw const AuthException('Invalid saved session response');
    }
    final session = Session.fromJson(payload);
    if (session == null || session.isExpired || session.refreshToken == null) {
      throw const AuthException('Invalid saved session response');
    }
    return session;
  } finally {
    if (httpClient == null) client.close();
  }
}
