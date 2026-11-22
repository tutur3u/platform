part of 'api_client.dart';

/// Captured by the originating operation, never reconstructed after an await.
final class ApiMutationAdmission {
  ApiMutationAdmission({
    required this.actorId,
    required bool Function() isCurrent,
    bool allowStepUpPrompt = false,
    void Function(ApiMutationNotDispatched)? onNotDispatched,
  }) : _stepUpCancellation = allowStepUpPrompt ? ValueNotifier(false) : null,
       _isCurrent = isCurrent,
       _onNotDispatched = onNotDispatched;
  final String actorId;
  final ValueNotifier<bool>? _stepUpCancellation;
  final bool Function() _isCurrent;
  final _additionalScopes = <bool Function()>[];
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

  void retire() {
    _retired = true;
    _stepUpCancellation?.value = true;
  }

  /// Adds a dispatch check for each attempt within an operation.
  Future<T> withScope<T>(
    bool Function() isCurrent,
    Future<T> Function() operation,
  ) async {
    _additionalScopes.add(isCurrent);
    try {
      return await operation();
    } finally {
      _additionalScopes.remove(isCurrent);
    }
  }

  bool get current {
    if (!_retired &&
        (_unsentFailure != null ||
            !_isCurrent() ||
            !_additionalScopes.every((isCurrent) => isCurrent()))) {
      retire();
    }
    return !_retired;
  }

  void check() {
    if (_unsentFailure != null || !current) {
      throw ApiMutationScopeChanged._(this);
    }
  }
}

final class ApiMutationScopeChanged extends ApiException {
  const ApiMutationScopeChanged._(this.admission)
    : super(message: 'Request scope changed', statusCode: 0);

  final ApiMutationAdmission admission;
}

final class ApiMutationNotDispatched extends ApiException {
  ApiMutationNotDispatched._(this.admission, this.cause)
    : super(message: 'Request was not dispatched', statusCode: 0);
  final ApiMutationAdmission admission;
  final Object cause;
}

extension _ApiClientMutations on ApiClient {
  Future<Map<String, dynamic>> _postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    bool sendOrigin = false,
    Duration timeout = const Duration(seconds: 30),
    Future<void> Function()? beforeDispatch,
  }) async {
    final url = _url(path);

    final response = await _performRequest(() async {
      final headers = {
        ...await _getHeaders(
          path: path,
          contentType: 'application/json',
          requiresAuth: requiresAuth,
        ),
        if (sendOrigin) 'Origin': url.origin,
      };
      if (beforeDispatch != null) await beforeDispatch();
      return await _client
          .post(url, headers: headers, body: jsonEncode(body))
          .timeout(timeout);
    }, requiresAuth: requiresAuth);

    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> _putJsonOperation(
    String path,
    Map<String, dynamic> body,
    ApiMutationAdmission admission,
    Future<void> Function(Map<String, dynamic>) onAcknowledged,
  ) async {
    Future<http.Response> send() async {
      admission.check();
      final headers = await _getHeaders(
        path: path,
        contentType: 'application/json',
      );
      _checkRequestUser(admission.actorId);
      admission.check();
      final request = http.Request('PUT', _url(path))
        ..headers.addAll(headers)
        ..body = jsonEncode(body);
      admission.recordDispatchPossible();
      return await http.Response.fromStream(await _client.send(request));
    }

    Future<Map<String, dynamic>> operation() async {
      final response = await _withStepUpReplay(admission.actorId, send);
      final receipt = _handleResponse(response);
      // The original operation owns cleanup even after UI departure or timeout.
      await onAcknowledged(receipt);
      return receipt;
    }

    try {
      return await operation().timeout(_requestTimeout);
    } on Object catch (error, stack) {
      Error.throwWithStackTrace(admission.preparationFailure(error), stack);
    }
  }

  /// Replays only after a pre-handler step-up. Foreground callers can opt in
  /// to the security check if the native credential does not clear it.
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
      Future<http.StreamedResponse> send() async {
        admitted();
        final headers = await _getHeaders(
          path: path,
          accept: accept,
          contentType: 'application/json',
        );
        admitted();
        final request = http.Request(method, _url(path))
          ..followRedirects = ApiVerification.token == null
          ..headers.addAll(headers)
          ..body = jsonEncode(body);
        // There is no async gap between this lease check and the HTTP dispatch.
        admitted();
        admission.recordDispatchPossible();
        return await _client.send(request).timeout(_requestTimeout);
      }

      return await _performStreamedRequest(() async {
        final response = await _withStreamStepUpReplay(admission.actorId, send);
        String? token;
        try {
          admitted();
          final cancellation = admission._stepUpCancellation;
          if (cancellation != null &&
              OfflineApiRequest.allowsChallenge &&
              _isStepUp(response.statusCode, response.headers)) {
            token = await _verificationToken(
              response,
              read: false,
              cancellation: cancellation,
            );
            admitted();
          }
        } on Object {
          await response.stream.listen(null).cancel();
          rethrow;
        }
        if (token == null || token.isEmpty) return response;

        await response.stream.listen(null).cancel();
        final replay = await ApiVerification.retry(token, send);
        try {
          admitted();
        } on Object {
          await replay.stream.listen(null).cancel();
          rethrow;
        }
        return replay;
      }, requiresAuth: false);
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
              path: path,
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
              path: path,
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

  /// No response-based retry beyond one replay after a pre-handler step-up.
  /// Admission follows async credential preparation.
  Future<Map<String, dynamic>> _mutateJsonAcknowledged(
    String method,
    String path,
    Map<String, dynamic> body,
    String actorId,
    bool Function() isCurrent,
  ) async {
    Future<http.Response> send() async {
      final headers = await _getHeaders(
        path: path,
        contentType: 'application/json',
      );
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
    }

    final response = await _performRequest(
      () async => await _withStepUpReplay(actorId, send),
      requiresAuth: false,
    );
    _checkRequestUser(actorId);
    if (!isCurrent()) {
      throw const ApiException(message: 'Request scope changed', statusCode: 0);
    }
    return _handleResponse(response);
  }
}
