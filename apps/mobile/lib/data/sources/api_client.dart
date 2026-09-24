import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_verification.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/auth/required_mfa_policy.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Lightweight HTTP client for calling mobile API endpoints.
///
/// Ported from apps/native/lib/api/client.ts.
class ApiClient {
  ApiClient({
    String? baseUrl,
    http.Client? httpClient,
    SupabaseClient? authClient,
  }) : _baseUrl = baseUrl?.replaceAll(RegExp(r'/$'), ''),
       _client = httpClient ?? http.Client(),
       _authClient = authClient;

  final http.Client _client;
  final SupabaseClient? _authClient;
  GoTrueClient get _auth => (_authClient ?? supabase).auth;
  final String? _baseUrl;
  static const int _expiryBufferMs = 60 * 1000;

  Uri _url(String path) =>
      Uri.parse('${_baseUrl ?? ApiConfig.baseUrlForPath(path)}$path');

  /// Bounded authenticated download. Redirects never receive a Bearer token.
  Future<Uint8List> getBytes(
    String path, {
    int maxBytes = 25 * 1024 * 1024,
  }) async {
    final response = await _performStreamedRequest(() async {
      final request = http.Request('GET', _url(path))
        ..followRedirects = false
        ..headers.addAll(await _getHeaders(accept: '*/*'));
      return await _client.send(request);
    });
    if (response.statusCode != 200 ||
        (response.contentLength != null &&
            response.contentLength! > maxBytes)) {
      await response.stream.listen(null).cancel();
      throw ApiException(
        message: 'Download failed',
        statusCode: response.statusCode,
      );
    }
    final bytes = BytesBuilder(copy: false);
    await for (final chunk in response.stream.timeout(
      const Duration(seconds: 30),
    )) {
      if (bytes.length + chunk.length > maxBytes) {
        throw const ApiException(
          message: 'Attachment exceeds download limit',
          statusCode: 0,
        );
      }
      bytes.add(chunk);
    }
    return bytes.takeBytes();
  }

  Future<void> _ensureValidSession({bool forceRefresh = false}) async {
    final session = _auth.currentSession;
    final expiresAt = session?.expiresAt;
    if (!forceRefresh && session != null && expiresAt != null) {
      final expiresAtMs = expiresAt > 1000000000000
          ? expiresAt
          : expiresAt * 1000;
      if (DateTime.now().millisecondsSinceEpoch <
          (expiresAtMs - _expiryBufferMs)) {
        return;
      }
    }

    try {
      final refreshed = await _auth.refreshSession();
      if (refreshed.session?.accessToken == null) {
        throw const ApiException(
          message: 'Failed to refresh session',
          statusCode: 0,
        );
      }
    } on ApiException {
      rethrow;
    } catch (e) {
      throw ApiException(
        message: 'Failed to refresh session: $e',
        statusCode: 0,
      );
    }
  }

  Future<Map<String, String>> _getHeaders({
    String accept = 'application/json',
    String? contentType,
    bool requiresAuth = true,
  }) async {
    String? token;
    final userId = requiresAuth ? _auth.currentUser?.id : null;

    if (requiresAuth) {
      token = _auth.currentSession?.accessToken;
      final hadTokenBeforeRefresh = token != null && token.isNotEmpty;

      try {
        await _ensureValidSession();
        token = _auth.currentSession?.accessToken ?? token;
      } on ApiException catch (error, stackTrace) {
        if (!hadTokenBeforeRefresh) {
          rethrow;
        }

        developer.log(
          'token refresh suppressed, using existing token',
          name: 'ApiClient',
          error: error,
          stackTrace: stackTrace,
          level: 500,
        );

        token = _auth.currentSession?.accessToken ?? token;
      }
    }

    if (requiresAuth) _checkRequestUser(userId);
    return {
      if (contentType != null) 'Content-Type': contentType,
      'Accept': accept,
      if (token != null) 'Authorization': 'Bearer $token',
      if (requiresAuth && ApiVerification.token != null)
        'x-tuturuuu-turnstile-token': ApiVerification.token!,
    };
  }

  /// GET JSON from [path] (relative to [_baseUrl]).
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
  }) async {
    final url = _url(path);

    final response = await _performRequest(
      () async => await _client.get(
        url,
        headers: await _getHeaders(requiresAuth: requiresAuth),
      ),
      requiresAuth: requiresAuth,
    );

    return _handleResponse(response);
  }

  /// GET JSON array from [path] (relative to [_baseUrl]).
  ///
  /// Supports both raw array responses and object responses with `data: []`.
  Future<List<dynamic>> getJsonList(
    String path, {
    bool requiresAuth = true,
  }) async {
    final url = _url(path);

    final response = await _performRequest(
      () async => await _client.get(
        url,
        headers: await _getHeaders(requiresAuth: requiresAuth),
      ),
      requiresAuth: requiresAuth,
    );

    // Reuse existing error handling behavior.
    if (response.statusCode < 200 || response.statusCode >= 300) {
      _handleResponse(response);
    }

    if (response.body.isEmpty) return const [];

    try {
      final decoded = jsonDecode(response.body);
      if (decoded is List<dynamic>) {
        return decoded;
      }
      if (decoded is Map<String, dynamic> && decoded['data'] is List<dynamic>) {
        return decoded['data'] as List<dynamic>;
      }
      throw const ApiException(
        message: 'Expected a JSON array response',
        statusCode: 0,
      );
    } on ApiException {
      rethrow;
    } on FormatException {
      throw const ApiException(message: 'Invalid JSON response', statusCode: 0);
    }
  }

  /// POST JSON to [path] (relative to [_baseUrl]).
  ///
  /// Returns the decoded JSON body on success, or throws [ApiException].
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    final url = _url(path);

    final response = await _performRequest(
      () async => await _client.post(
        url,
        headers: await _getHeaders(
          contentType: 'application/json',
          requiresAuth: requiresAuth,
        ),
        body: jsonEncode(body),
      ),
      requiresAuth: requiresAuth,
      timeout: timeout,
    );

    return _handleResponse(response);
  }

  /// PATCH JSON to [path] (relative to [_baseUrl]).
  ///
  /// Returns the decoded JSON body on success, or throws [ApiException].
  Future<Map<String, dynamic>> patchJson(
    String path,
    Map<String, dynamic> body, {
    bool requiresAuth = true,
  }) async {
    final url = _url(path);

    final response = await _performRequest(
      () async => await _client.patch(
        url,
        headers: await _getHeaders(
          contentType: 'application/json',
          requiresAuth: requiresAuth,
        ),
        body: jsonEncode(body),
      ),
      requiresAuth: requiresAuth,
    );

    return _handleResponse(response);
  }

  /// DELETE [path] (relative to [_baseUrl]).
  ///
  /// Returns the decoded JSON body on success, or throws [ApiException].
  Future<Map<String, dynamic>> deleteJson(
    String path, {
    Map<String, dynamic>? body,
    bool requiresAuth = true,
  }) async {
    final url = _url(path);

    final response = await _performRequest(
      () async => await _client.delete(
        url,
        headers: await _getHeaders(
          contentType: body == null ? null : 'application/json',
          requiresAuth: requiresAuth,
        ),
        body: body == null ? null : jsonEncode(body),
      ),
      requiresAuth: requiresAuth,
    );

    return _handleResponse(response);
  }

  /// PUT JSON to [path] (relative to [_baseUrl]).
  ///
  /// Returns the decoded JSON body on success, or throws [ApiException].
  Future<Map<String, dynamic>> putJson(
    String path,
    Map<String, dynamic> body, {
    bool requiresAuth = true,
  }) async {
    final url = _url(path);

    final response = await _performRequest(
      () async => await _client.put(
        url,
        headers: await _getHeaders(
          contentType: 'application/json',
          requiresAuth: requiresAuth,
        ),
        body: jsonEncode(body),
      ),
      requiresAuth: requiresAuth,
    );

    return _handleResponse(response);
  }

  Future<http.StreamedResponse> getStream(
    String path, {
    String accept = 'application/octet-stream',
    bool requiresAuth = true,
  }) async {
    final url = _url(path);

    return await _performStreamedRequest(() async {
      final request = http.Request('GET', url)
        ..headers.addAll(
          await _getHeaders(accept: accept, requiresAuth: requiresAuth),
        );
      return await _client.send(request);
    }, requiresAuth: requiresAuth);
  }

  Future<http.StreamedResponse> sendJsonStream(
    String method,
    String path,
    Object? body, {
    String accept = 'application/octet-stream',
    bool requiresAuth = true,
  }) async {
    final url = _url(path);

    return await _performStreamedRequest(() async {
      final request = http.Request(method, url)
        ..headers.addAll(
          await _getHeaders(
            accept: accept,
            contentType: 'application/json',
            requiresAuth: requiresAuth,
          ),
        )
        ..body = jsonEncode(body);
      return await _client.send(request);
    }, requiresAuth: requiresAuth);
  }

  Future<Map<String, dynamic>> sendMultipart(
    String method,
    String path, {
    Map<String, String>? fields,
    List<ApiMultipartFile> files = const [],
    bool requiresAuth = true,
  }) async {
    final url = _url(path);

    final streamedResponse = await _performStreamedRequest(() async {
      final request = http.MultipartRequest(method, url)
        ..headers.addAll(await _getHeaders(requiresAuth: requiresAuth));

      if (fields != null) {
        request.fields.addAll(fields);
      }

      for (final file in files) {
        request.files.add(
          file.bytes != null
              ? http.MultipartFile.fromBytes(
                  file.field,
                  file.bytes!,
                  filename: file.filename,
                  contentType: file.contentType,
                )
              : await http.MultipartFile.fromPath(
                  file.field,
                  file.filePath!,
                  filename: file.filename,
                  contentType: file.contentType,
                ),
        );
      }

      return await _client.send(request);
    }, requiresAuth: requiresAuth);

    final response = await http.Response.fromStream(streamedResponse);
    return _handleResponse(response);
  }

  void _checkRequestUser(String? userId) {
    if (userId == null || _auth.currentUser?.id != userId) {
      throw const ApiException(
        message: 'Account changed during request',
        statusCode: 401,
      );
    }
  }

  Future<http.Response> _performRequest(
    Future<http.Response> Function() request, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    try {
      final userId = requiresAuth ? _auth.currentUser?.id : null;
      var response = await request().timeout(timeout);
      if (requiresAuth) _checkRequestUser(userId);
      if (requiresAuth && response.statusCode == 401) {
        await _ensureValidSession(forceRefresh: true);
        _checkRequestUser(userId);
        response = await request().timeout(timeout);
        _checkRequestUser(userId);
      }
      if (requiresAuth &&
          response.statusCode == 403 &&
          response.headers['x-abuse-challenge'] == 'turnstile') {
        final token = await ApiVerification.requestToken?.call();
        _checkRequestUser(userId);
        if (token != null && token.isNotEmpty) {
          response = await ApiVerification.retry(
            token,
            () => request().timeout(timeout),
          );
          _checkRequestUser(userId);
        }
      }
      return response;
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw const ApiException(message: 'Request timed out', statusCode: 0);
    } catch (e) {
      throw ApiException(message: e.toString(), statusCode: 0);
    }
  }

  Future<http.StreamedResponse> _performStreamedRequest(
    Future<http.StreamedResponse> Function() request, {
    bool requiresAuth = true,
  }) async {
    try {
      final userId = requiresAuth ? _auth.currentUser?.id : null;
      var response = await request().timeout(const Duration(seconds: 30));
      if (requiresAuth) _checkRequestUser(userId);
      if (requiresAuth && response.statusCode == 401) {
        await response.stream.listen(null).cancel();
        await _ensureValidSession(forceRefresh: true);
        _checkRequestUser(userId);
        response = await request().timeout(const Duration(seconds: 30));
        _checkRequestUser(userId);
      }
      if (requiresAuth &&
          response.statusCode == 403 &&
          response.headers['x-abuse-challenge'] == 'turnstile') {
        final token = await ApiVerification.requestToken?.call();
        _checkRequestUser(userId);
        if (token != null && token.isNotEmpty) {
          await response.stream.listen(null).cancel();
          response = await ApiVerification.retry(
            token,
            () => request().timeout(const Duration(seconds: 30)),
          );
          _checkRequestUser(userId);
        }
      }
      return response;
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw const ApiException(message: 'Request timed out', statusCode: 0);
    } catch (e) {
      throw ApiException(message: e.toString(), statusCode: 0);
    }
  }

  Map<String, dynamic> _handleResponse(http.Response response) {
    Map<String, dynamic>? parsed;
    if (response.body.isNotEmpty) {
      try {
        final decoded = jsonDecode(response.body);
        if (decoded is Map<String, dynamic>) {
          parsed = decoded;
        }
      } on FormatException {
        parsed = null;
      }
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      if (parsed?['code'] == 'MFA_REQUIRED') {
        unawaited(refreshRequiredMfa(_auth));
      }
      final errorMessage =
          parsed?['message'] as String? ??
          parsed?['error'] as String? ??
          'Request failed';
      final validationErrors =
          (parsed?['errors'] as List<dynamic>? ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map((error) => error['message']?.toString().trim() ?? '')
              .where((message) => message.isNotEmpty)
              .toList(growable: false);
      final effectiveMessage =
          validationErrors.isNotEmpty &&
              validationErrors.first.toLowerCase() != errorMessage.toLowerCase()
          ? '$errorMessage: ${validationErrors.first}'
          : errorMessage;
      developer.log(
        'HTTP ${response.statusCode}; code=${parsed?['code'] ?? 'unknown'}',
        name: 'ApiClient',
      );
      throw ApiException(
        message: effectiveMessage,
        statusCode: response.statusCode,
        retryAfter: parsed?['retryAfter'] as int?,
        code: parsed?['code'] as String?,
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
      final message =
          'Failed to parse JSON: ${e.message}. '
          'Input length: ${jsonString.length}';
      throw FormatException(message);
    } on Exception catch (e) {
      final message =
          'Failed to parse JSON: $e. '
          'Input length: ${jsonString.length}';
      throw FormatException(message);
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
    this.code,
  });

  final String message;
  final int statusCode;
  final int? retryAfter;
  final String? code;

  @override
  String toString() => 'ApiException($statusCode): $message';
}

class ApiMultipartFile {
  const ApiMultipartFile({
    required this.field,
    required this.filePath,
    this.filename,
    this.contentType,
  }) : bytes = null;

  const ApiMultipartFile.bytes({
    required this.field,
    required this.bytes,
    this.filename,
    this.contentType,
  }) : filePath = null;

  final String field;
  final String? filePath;
  final Uint8List? bytes;
  final String? filename;
  final MediaType? contentType;
}
