part of 'api_client.dart';

/// withSessionAuth's pre-handler Turnstile step-up. The handler never ran, so
/// replaying the request after a credential re-mint cannot repeat a write.
bool _isStepUp(int statusCode, Map<String, String> headers) =>
    statusCode == 403 && headers['x-abuse-challenge'] == 'turnstile';

final Object _sentMobileClientKey = Object();

/// Records the credential one request attempt actually carried.
final class _SentMobileClient {
  String? token;

  Future<T> run<T>(Future<T> Function() request) =>
      runZoned(request, zoneValues: {_sentMobileClientKey: this});
}

/// Requests that carry the credential never follow redirects: `dart:io`
/// strips only `Authorization` and cookies when a redirect changes host.
final class _MobileClientRedirectGuard extends http.BaseClient {
  _MobileClientRedirectGuard(this._inner);

  final http.Client _inner;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    if (request.headers.containsKey(mobileClientHeader)) {
      request.followRedirects = false;
    }
    return MobileDiagnostics.instance.observe(
      request.method,
      request.url,
      () => _inner.send(request),
    );
  }

  @override
  void close() => _inner.close();
}

extension _ApiClientMobileClient on ApiClient {
  MobileClientCredentials get _mobileClient => MobileClientCredentials.instance;

  Future<Map<String, String>> _getHeaders({
    String accept = 'application/json',
    String? contentType,
    bool requiresAuth = true,
    bool offlineRead = false,
  }) async {
    String? token;
    final userId = requiresAuth ? _auth.currentUser?.id : null;

    // Simulate latency before credentials are read. The call paths still
    // perform their normal account and mutation admission checks.
    if (MobileDiagnostics.instance.slowNetwork) {
      await Future<void>.delayed(const Duration(seconds: 1));
    }
    if (requiresAuth) {
      _checkRequestUser(userId);
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
      if (requiresAuth && offlineRead && OfflineApiRequest.active)
        'x-tuturuuu-offline-download': '1',
      if (token != null) 'Authorization': 'Bearer $token',
      // Reads pass offlineRead; every other authenticated request mutates.
      ...await _mobileClientHeaders(userId, token, mutation: !offlineRead),
      if (requiresAuth && ApiVerification.token != null)
        'x-tuturuuu-turnstile-token': ApiVerification.token!,
    };
  }

  /// Attaches the stored native client credential to an authenticated
  /// mutation; the server ignores it on reads. Without a fresh one a mint
  /// starts in the background, so a slow or unavailable Turnstile page never
  /// delays the request itself; a step-up on this request still awaits that
  /// mint before one replay.
  Future<Map<String, String>> _mobileClientHeaders(
    String? userId,
    String? accessToken, {
    required bool mutation,
  }) async {
    if (!mutation ||
        userId == null ||
        accessToken == null ||
        accessToken.isEmpty) {
      return const {};
    }
    final credential = await _mobileClient.current(
      userId: userId,
      accessToken: accessToken,
    );
    (Zone.current[_sentMobileClientKey] as _SentMobileClient?)?.token =
        credential;
    if (OfflineApiRequest.allowsChallenge) {
      unawaited(
        _mobileClient.ensure(
          userId: userId,
          accessToken: accessToken,
          origin: _url(mobileClientCredentialEndpoint),
          mint: (captcha) => _mintMobileClient(userId, accessToken, captcha),
        ),
      );
    }
    return credential == null ? const {} : {mobileClientHeader: credential};
  }

  /// Calls the mint endpoint directly, so it never re-enters the credential
  /// or step-up handling. No `Origin` header: the endpoint refuses browsers.
  Future<Map<String, dynamic>> _mintMobileClient(
    String userId,
    String accessToken,
    String captchaToken,
  ) async {
    _checkRequestUser(userId);
    final response = await _client
        .post(
          _url(mobileClientCredentialEndpoint),
          headers: {
            'Accept': 'application/json',
            'Authorization': 'Bearer $accessToken',
            'Content-Type': 'application/json',
          },
          body: jsonEncode({'captchaToken': captchaToken}),
        )
        .timeout(_requestTimeout);
    _checkRequestUser(userId);
    return _handleResponse(response);
  }

  /// After a step-up on a request that carried [sent] (null for none),
  /// returns true when a different credential is ready to replay with. Only
  /// a credential the server actually refused is dropped and re-minted; one
  /// stored after the request left is used as is.
  Future<bool> _remintMobileClient(String userId, String? sent) async {
    if (!OfflineApiRequest.allowsChallenge) return false;
    _checkRequestUser(userId);
    final accessToken = _auth.currentSession?.accessToken;
    if (accessToken == null || accessToken.isEmpty) return false;
    final stored = await _mobileClient.current(
      userId: userId,
      accessToken: accessToken,
    );
    if (stored != null && stored != sent) return true;
    final next = await _mobileClient.ensure(
      userId: userId,
      accessToken: accessToken,
      origin: _url(mobileClientCredentialEndpoint),
      mint: (captcha) => _mintMobileClient(userId, accessToken, captcha),
      force: sent != null,
      rejected: sent,
    );
    _checkRequestUser(userId);
    return next != null && next != sent;
  }

  /// Sends [request], and after a step-up replays it once with a credential
  /// the first attempt did not carry.
  Future<http.Response> _withStepUpReplay(
    String? userId,
    Future<http.Response> Function() request,
  ) async {
    final sent = _SentMobileClient();
    final response = await sent.run(request);
    if (userId == null ||
        !_isStepUp(response.statusCode, response.headers) ||
        !await _remintMobileClient(userId, sent.token)) {
      return response;
    }
    final replay = await request();
    _checkRequestUser(userId);
    return replay;
  }

  Future<http.StreamedResponse> _withStreamStepUpReplay(
    String? userId,
    Future<http.StreamedResponse> Function() request,
  ) async {
    final sent = _SentMobileClient();
    final response = await sent.run(request);
    if (userId == null ||
        !_isStepUp(response.statusCode, response.headers) ||
        !await _remintMobileClient(userId, sent.token)) {
      return response;
    }
    await response.stream.listen(null).cancel();
    final replay = await request();
    _checkRequestUser(userId);
    return replay;
  }
}
