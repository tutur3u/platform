import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/supabase_client.dart';

/// Lightweight HTTP client for calling mobile API endpoints.
///
/// Ported from apps/native/lib/api/client.ts.
class ApiClient {
  ApiClient({http.Client? httpClient}) : _client = httpClient ?? http.Client();

  final http.Client _client;

  Future<void> _ensureValidSession() async {
    final session = supabase.auth.currentSession;
    final expiresAt = session?.expiresAt;
    if (session != null && expiresAt != null) {
      final expiresAtMs =
          expiresAt > 1000000000000 ? expiresAt : expiresAt * 1000;
      if (DateTime.now().millisecondsSinceEpoch < expiresAtMs) {
        return;
      }
    }

    try {
      await supabase.auth.refreshSession();
    } catch (e) {
      throw ApiException(
        message: 'Failed to refresh session: $e',
        statusCode: 0,
      );
    }
  }

  Future<Map<String, String>> _getHeaders({
    String? contentType,
    bool requiresAuth = true,
  }) async {
    if (requiresAuth) {
      await _ensureValidSession();
    }
    final session = supabase.auth.currentSession;
    final token = session?.accessToken;

    return {
      if (contentType != null) 'Content-Type': contentType,
      'Accept': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  /// GET JSON from [path] (relative to [ApiConfig.baseUrl]).
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
  }) async {
    final url = Uri.parse('${ApiConfig.baseUrl}$path');

    final response = await _performRequest(
      () async => _client.get(
        url,
        headers: await _getHeaders(requiresAuth: requiresAuth),
      ),
    );

    return _handleResponse(response);
  }

  /// POST JSON to [path] (relative to [ApiConfig.baseUrl]).
  ///
  /// Returns the decoded JSON body on success, or throws [ApiException].
  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body, {
    bool requiresAuth = true,
  }) async {
    final url = Uri.parse('${ApiConfig.baseUrl}$path');

    final response = await _performRequest(
      () async => _client.post(
        url,
        headers: await _getHeaders(
          contentType: 'application/json',
          requiresAuth: requiresAuth,
        ),
        body: jsonEncode(body),
      ),
    );

    return _handleResponse(response);
  }

  /// PATCH JSON to [path] (relative to [ApiConfig.baseUrl]).
  ///
  /// Returns the decoded JSON body on success, or throws [ApiException].
  Future<Map<String, dynamic>> patchJson(
    String path,
    Map<String, dynamic> body, {
    bool requiresAuth = true,
  }) async {
    final url = Uri.parse('${ApiConfig.baseUrl}$path');

    final response = await _performRequest(
      () async => _client.patch(
        url,
        headers: await _getHeaders(
          contentType: 'application/json',
          requiresAuth: requiresAuth,
        ),
        body: jsonEncode(body),
      ),
    );

    return _handleResponse(response);
  }

  /// DELETE [path] (relative to [ApiConfig.baseUrl]).
  ///
  /// Returns the decoded JSON body on success, or throws [ApiException].
  Future<Map<String, dynamic>> deleteJson(
    String path, {
    bool requiresAuth = true,
  }) async {
    final url = Uri.parse('${ApiConfig.baseUrl}$path');

    final response = await _performRequest(
      () async => _client.delete(
        url,
        headers: await _getHeaders(requiresAuth: requiresAuth),
      ),
    );

    return _handleResponse(response);
  }

  Future<http.Response> _performRequest(
    Future<http.Response> Function() request,
  ) async {
    try {
      return await request().timeout(const Duration(seconds: 30));
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw const ApiException(
        message: 'Request timed out',
        statusCode: 0,
      );
    } catch (e) {
      throw ApiException(
        message: e.toString(),
        statusCode: 0,
      );
    }
  }

  Map<String, dynamic> _handleResponse(http.Response response) {
    Map<String, dynamic>? parsed;
    if (response.body.isNotEmpty) {
      try {
        parsed = jsonDecode(response.body) as Map<String, dynamic>;
      } on FormatException {
        parsed = null;
      }
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        message: parsed?['error'] as String? ?? 'Request failed',
        statusCode: response.statusCode,
        retryAfter: parsed?['retryAfter'] as int?,
      );
    }

    return parsed ?? {};
  }

  /// Parse JSON string into Map.
  Map<String, dynamic> parseJson(String jsonString) {
    try {
      final decoded = jsonDecode(jsonString);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }

      throw const FormatException('Expected a JSON object');
    } on FormatException catch (e) {
      throw FormatException(
        'Failed to parse JSON: ${e.message}. Input length: ${jsonString.length}',
      );
    } on Exception catch (e) {
      throw FormatException(
        'Failed to parse JSON: $e. Input length: ${jsonString.length}',
      );
    }
  }

  void dispose() => _client.close();
}

/// Exception thrown by [ApiClient] on non-2xx responses or network errors.
class ApiException implements Exception {
  const ApiException({
    required this.message,
    required this.statusCode,
    this.retryAfter,
  });

  final String message;
  final int statusCode;
  final int? retryAfter;

  @override
  String toString() => 'ApiException($statusCode): $message';
}
