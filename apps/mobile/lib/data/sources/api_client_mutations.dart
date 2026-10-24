part of 'api_client.dart';

/// Captured by the originating operation, never reconstructed after an await.
final class ApiMutationAdmission {
  ApiMutationAdmission({
    required this.actorId,
    required bool Function() isCurrent,
    void Function(ApiMutationNotDispatched)? onNotDispatched,
  }) : _isCurrent = isCurrent,
       _onNotDispatched = onNotDispatched;
  final String actorId;
  final bool Function() _isCurrent;
  bool _retired = false;
  bool _dispatchPossible = false;
  final void Function(ApiMutationNotDispatched)? _onNotDispatched;
  ApiMutationNotDispatched? _unsentFailure;
  bool get definitelyNotDispatched =>
      _unsentFailure != null && !_dispatchPossible;

  /// Also used immediately before handing a mutation to durable storage.
  void recordDispatchPossible() {
    check();
    _dispatchPossible = true;
  }

  Object preparationFailure(Object error) {
    if (_dispatchPossible) return error;
    final existing = _unsentFailure;
    if (existing != null) return existing;
    final failure = ApiMutationNotDispatched._(this, error);
    _unsentFailure = failure;
    _onNotDispatched?.call(failure);
    return failure;
  }

  bool get current {
    if (_unsentFailure != null || !_isCurrent()) {
      _retired = true;
    }
    return !_retired;
  }

  void check() {
    if (_unsentFailure != null || !current) {
      throw const ApiException(message: 'Request scope changed', statusCode: 0);
    }
  }
}

final class ApiMutationNotDispatched extends ApiException {
  ApiMutationNotDispatched._(this.admission, this.cause)
    : super(message: 'Request was not dispatched', statusCode: 0);
  final ApiMutationAdmission admission;
  final Object cause;
}

extension _ApiClientMutations on ApiClient {
  /// Native mutations dispatch once without auth or challenge response replay.
  Future<http.StreamedResponse> _sendJsonStreamAcknowledged(
    String method,
    String path,
    Object? body,
    ApiMutationAdmission admission,
    String accept,
  ) async {
    void admitted() {
      admission.check();
      _checkRequestUser(admission.actorId);
    }

    try {
      admitted();
      final response = await _performStreamedRequest(() async {
        admitted();
        final headers = await _getHeaders(
          accept: accept,
          contentType: 'application/json',
        );
        admitted();
        final request = http.Request(method, _url(path))
          ..headers.addAll(headers)
          ..body = jsonEncode(body);
        // There is no async gap between this lease check and the HTTP dispatch.
        admitted();
        admission.recordDispatchPossible();
        return await _client.send(request).timeout(_requestTimeout);
      }, requiresAuth: false);
      try {
        admitted();
      } on Object {
        await response.stream.listen(null).cancel();
        rethrow;
      }
      return response;
    } on Object catch (error, stack) {
      Error.throwWithStackTrace(admission.preparationFailure(error), stack);
    }
  }

  Future<Map<String, dynamic>> _patchJson(
    String path,
    Map<String, dynamic> body, {
    bool requiresAuth = true,
  }) async {
    if (requiresAuth && NativeIntegrityClient.protects(path)) {
      return _handleResponse(
        await _requestWithIntegrity('PATCH', path, body: jsonEncode(body)),
      );
    }
    final url = _url(path);

    final response = await _performRequest(
      () async => await _client
          .patch(
            url,
            headers: await _getHeaders(
              contentType: 'application/json',
              requiresAuth: requiresAuth,
            ),
            body: jsonEncode(body),
          )
          .timeout(_requestTimeout),
      requiresAuth: requiresAuth,
    );

    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> _deleteJson(
    String path, {
    Map<String, dynamic>? body,
    bool requiresAuth = true,
  }) async {
    final url = _url(path);

    final response = await _performRequest(
      () async => await _client
          .delete(
            url,
            headers: await _getHeaders(
              contentType: body == null ? null : 'application/json',
              requiresAuth: requiresAuth,
            ),
            body: body == null ? null : jsonEncode(body),
          )
          .timeout(_requestTimeout),
      requiresAuth: requiresAuth,
    );

    return _handleResponse(response);
  }

  /// No response-based retry. Admission follows async credential preparation.
  Future<Map<String, dynamic>> _mutateJsonAcknowledged(
    String method,
    String path,
    Map<String, dynamic> body,
    String actorId,
    bool Function() isCurrent,
  ) async {
    final response = await _performRequest(() async {
      final headers = await _getHeaders(contentType: 'application/json');
      _checkRequestUser(actorId);
      if (!isCurrent()) {
        throw const ApiException(
          message: 'Request scope changed',
          statusCode: 0,
        );
      }
      final request = http.Request(method, _url(path))
        ..headers.addAll(headers)
        ..body = jsonEncode(body);
      final streamed = await _client.send(request).timeout(_requestTimeout);
      return await http.Response.fromStream(streamed).timeout(_requestTimeout);
    }, requiresAuth: false);
    _checkRequestUser(actorId);
    if (!isCurrent()) {
      throw const ApiException(message: 'Request scope changed', statusCode: 0);
    }
    return _handleResponse(response);
  }
}
