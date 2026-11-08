part of 'api_client.dart';

extension ConditionalApiReads on ApiClient {
  /// Uses the normal authenticated retry/session path, preserving HTTP 304.
  Future<Map<String, dynamic>?> getConditionalJson(
    String path, {
    String? version,
  }) async {
    final response = await _performRequest(() async {
      final userId = _auth.currentUser?.id;
      final headers = await _getHeaders();
      if (version != null) headers['If-None-Match'] = version;
      _checkRequestUser(userId);
      return await _client
          .get(_url(path), headers: headers)
          .timeout(_requestTimeout);
    });
    if (response.statusCode == 304) return null;
    return _handleResponse(response);
  }
}
