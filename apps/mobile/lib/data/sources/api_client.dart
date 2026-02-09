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

  /// Common headers for all requests.
  ///
  /// Includes the Supabase access token for authenticated endpoints.
  Map<String, String> get _headers {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    final accessToken = supabase.auth.currentSession?.accessToken;
    if (accessToken != null) {
      headers['Authorization'] = 'Bearer $accessToken';
    }
    return headers;
  }

  /// GET JSON from [path] (relative to [ApiConfig.baseUrl]).
  ///
  /// Returns the decoded JSON body on success, or throws [ApiException].
  Future<Map<String, dynamic>> getJson(String path) async {
    final url = Uri.parse('${ApiConfig.baseUrl}$path');

    try {
      final response = await _client
          .get(url, headers: _headers)
          .timeout(const Duration(seconds: 30));

      return _parseResponse(response);
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw const ApiException(message: 'Request timed out', statusCode: 0);
    } catch (e) {
      throw ApiException(message: e.toString(), statusCode: 0);
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
          .post(url, headers: _headers, body: jsonEncode(body))
          .timeout(const Duration(seconds: 30));

      return _parseResponse(response);
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw const ApiException(message: 'Request timed out', statusCode: 0);
    } catch (e) {
      throw ApiException(message: e.toString(), statusCode: 0);
    }
  }

  /// PUT JSON to [path] (relative to [ApiConfig.baseUrl]).
  ///
  /// Returns the decoded JSON body on success, or throws [ApiException].
  Future<Map<String, dynamic>> putJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final url = Uri.parse('${ApiConfig.baseUrl}$path');

    try {
      final response = await _client
          .put(url, headers: _headers, body: jsonEncode(body))
          .timeout(const Duration(seconds: 30));

      return _parseResponse(response);
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw const ApiException(message: 'Request timed out', statusCode: 0);
    } catch (e) {
      throw ApiException(message: e.toString(), statusCode: 0);
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
          .patch(url, headers: _headers, body: jsonEncode(body))
          .timeout(const Duration(seconds: 30));

      return _parseResponse(response);
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw const ApiException(message: 'Request timed out', statusCode: 0);
    } catch (e) {
      throw ApiException(message: e.toString(), statusCode: 0);
    }
  }

  /// DELETE [path] (relative to [ApiConfig.baseUrl]).
  ///
  /// Returns the decoded JSON body on success, or throws [ApiException].
  Future<Map<String, dynamic>> deleteJson(String path) async {
    final url = Uri.parse('${ApiConfig.baseUrl}$path');

    try {
      final response = await _client
          .delete(url, headers: _headers)
          .timeout(const Duration(seconds: 30));

      return _parseResponse(response);
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw const ApiException(message: 'Request timed out', statusCode: 0);
    } catch (e) {
      throw ApiException(message: e.toString(), statusCode: 0);
    }
  }

  /// Parses the [response] body as JSON and throws [ApiException] on non-2xx.
  Map<String, dynamic> _parseResponse(http.Response response) {
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
