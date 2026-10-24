part of 'api_client.dart';

extension _ApiClientIntegrity on ApiClient {
  Future<http.Response> _requestWithIntegrity(
    String method,
    String path, {
    String body = '',
  }) async {
    final actor = _auth.currentUser?.id;
    _checkRequestUser(actor);
    final scope = '${_url(path).origin}:$actor';
    return await NativeIntegrityClient.runRequest(
      scope,
      () => _requestWithIntegrityUnlocked(method, path, actor, body: body),
    );
  }

  Future<http.Response> _requestWithIntegrityUnlocked(
    String method,
    String path,
    String? actor, {
    String body = '',
  }) async {
    _checkRequestUser(actor);
    if (actor == null) {
      throw const ApiException(
        message: 'Authentication required',
        statusCode: 401,
      );
    }
    var fallbackUsed = false;
    Future<http.Response> send({bool fallback = false}) async {
      final headers = await _getHeaders(
        contentType: method == 'PATCH' ? 'application/json' : null,
        offlineRead: method == 'GET',
      );
      _checkRequestUser(actor);
      final proof = await _nativeIntegrity.headers(
        actor: actor,
        origin: _url(path),
        method: method,
        path: path,
        body: body,
        forceTurnstile: fallback,
        post: (endpoint, payload) async {
          _checkRequestUser(actor);
          final response = await _client
              .post(
                _url(endpoint),
                headers: {...headers, 'Content-Type': 'application/json'},
                body: jsonEncode(payload),
              )
              .timeout(_requestTimeout);
          _checkRequestUser(actor);
          return _handleResponse(response);
        },
      );
      _checkRequestUser(actor);
      return await OfflineApiRequest.paced(() async {
        _checkRequestUser(actor);
        final request = http.Request(method, _url(path))
          ..followRedirects = false
          ..headers.addAll({...headers, ...proof})
          ..body = body;
        return await http.Response.fromStream(
          await _client.send(request).timeout(_requestTimeout),
        ).timeout(_requestTimeout);
      });
    }

    return await _performRequest(() async {
      final response = await send();
      // This code is reserved for the server's pre-domain integrity gate.
      // Transport errors and generic 403 responses never replay a mutation.
      if (!fallbackUsed &&
          OfflineApiRequest.allowsChallenge &&
          response.statusCode == 403) {
        Object? data;
        try {
          data = jsonDecode(response.body);
        } on FormatException {
          return response;
        }
        if (data is Map && data['code'] == 'NATIVE_INTEGRITY_REQUIRED') {
          fallbackUsed = true;
          return await send(fallback: true);
        }
      }
      return response;
    });
  }
}
