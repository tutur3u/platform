import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:mobile/core/config/api_config.dart';

/// Lightweight HTTP client for calling mobile API endpoints.
///
/// Ported from apps/native/lib/api/client.ts.
class ApiClient {
  ApiClient({http.Client? httpClient})
      : _client = httpClient ?? http.Client();

  final http.Client _client;

  /// POST JSON to [path] (relative to [ApiConfig.baseUrl]).
  ///
  /// Returns the decoded JSON body on success, or throws [ApiException].
  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final url = Uri.parse('${ApiConfig.baseUrl}$path');

    try {
      final response = await _client.post(
        url,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: jsonEncode(body),
      );

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
    } on ApiException {
      rethrow;
    } catch (e) {
      throw ApiException(
        message: e.toString(),
        statusCode: 0,
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
