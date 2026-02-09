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
    try {
      await supabase.auth.refreshSession();
    } catch (e) {
      throw ApiException(
        message: 'Failed to refresh session: $e',
        statusCode: 0,
      );
    }
  }

  Future<Map<String, String>> _getHeaders({String? contentType}) async {
    await _ensureValidSession();
    final session = supabase.auth.currentSession;
    final token = session?.accessToken;

    return {
      if (contentType != null) 'Content-Type': contentType,
      'Accept': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  /// GET JSON from [path] (relative to [ApiConfig.baseUrl]).
  Future<Map<String, dynamic>> getJson(String path) async {
    final url = Uri.parse('${ApiConfig.baseUrl}$path');

    try {
      final response = await _client
          .get(
            url,
            headers: await _getHeaders(),
          )
          .timeout(const Duration(seconds: 30));

      return _handleResponse(response);
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

  /// POST JSON to [path] (relative to [ApiConfig.baseUrl]).
  ///
  /// Returns the decoded JSON body on success, or throws [ApiException].
  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final url = Uri.parse('${ApiConfig.baseUrl}$path');

    try {
      final response = await _client
          .post(
            url,
            headers: await _getHeaders(contentType: 'application/json'),
            body: jsonEncode(body),
          )
          .timeout(const Duration(seconds: 30));

      return _handleResponse(response);
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

  /// PATCH JSON to [path] (relative to [ApiConfig.baseUrl]).
  ///
  /// Returns the decoded JSON body on success, or throws [ApiException].
  Future<Map<String, dynamic>> patchJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final url = Uri.parse('${ApiConfig.baseUrl}$path');

    try {
      final response = await _client
          .patch(
            url,
            headers: await _getHeaders(contentType: 'application/json'),
            body: jsonEncode(body),
          )
          .timeout(const Duration(seconds: 30));

      return _handleResponse(response);
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

  /// DELETE [path] (relative to [ApiConfig.baseUrl]).
  ///
  /// Returns the decoded JSON body on success, or throws [ApiException].
  Future<Map<String, dynamic>> deleteJson(String path) async {
    final url = Uri.parse('${ApiConfig.baseUrl}$path');

    try {
      final response = await _client
          .delete(
            url,
            headers: await _getHeaders(),
          )
          .timeout(const Duration(seconds: 30));

      return _handleResponse(response);
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
        'Failed to parse JSON: ${e.message}. Input: $jsonString',
      );
    } on Exception catch (e) {
      throw FormatException(
        'Failed to parse JSON: $e. Input: $jsonString',
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
