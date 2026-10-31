import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:mobile/features/mastermind/data/hub_config.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/iris/data/iris_parsers.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';

/// The relay on the hub origin (`/v1/iris/*`): the owner JWT as on every hub
/// route, plus the device signature from [IrisRequestSigner] on every request.
///
/// Nothing here logs or stores a token, signature, header, body or URL; every
/// failure collapses to an [IrisFailureKind]. A 423 `killed` (or a 503
/// `iris_killed` from an older Worker) is the kill switch: the app turns
/// read-only until the relay says otherwise.
final class HttpIrisRelay implements IrisRelay {
  HttpIrisRelay({
    required Uri? baseUrl,
    required AccessTokenProvider tokens,
    required IrisRequestSigner signer,
    http.Client? client,
    this.timeout = const Duration(seconds: 20),
  }) : _base = baseUrl == null
           ? null
           : MastermindHubConfig.parseBaseUrl(baseUrl.toString()),
       _tokens = tokens,
       _signer = signer,
       _client = client ?? http.Client(),
       _ownsClient = client == null;

  final Uri? _base;
  final AccessTokenProvider _tokens;
  final IrisRequestSigner _signer;
  final http.Client _client;
  final bool _ownsClient;
  final Duration timeout;

  /// The relay accepts 1..16000 characters.
  static const maxTextLength = 16000;

  void close() {
    if (_ownsClient) _client.close();
  }

  @override
  bool get isConfigured => _base != null;

  @override
  Future<IrisResult<IrisFeedPage>> feed({
    String? before,
    String? after,
    int limit = 50,
  }) {
    RangeError.checkValueInInterval(limit, 1, irisFeedPageMaxMessages, 'limit');
    if (before != null && after != null) {
      throw ArgumentError('feed takes before or after, never both');
    }
    for (final cursor in [?before, ?after]) {
      if (!irisMessageRefPattern.hasMatch(cursor)) {
        throw ArgumentError.value(cursor, 'cursor');
      }
    }
    return _call(
      'GET',
      '/v1/iris/feed',
      query: {'before': ?before, 'after': ?after, 'limit': '$limit'},
      maxBytes: irisFeedMaxBytes,
      parse: parseIrisFeedPage,
    );
  }

  @override
  Future<IrisResult<IrisReceipt>> send(
    String text, {
    required String idempotencyKey,
  }) {
    if (text.isEmpty || text.length > maxTextLength) {
      throw ArgumentError.value(text.length, 'text', 'length');
    }
    if (!irisIdempotencyKeyPattern.hasMatch(idempotencyKey)) {
      throw ArgumentError.value(idempotencyKey, 'idempotencyKey');
    }
    return _call(
      'POST',
      '/v1/iris/send',
      body: {'target': 'atlas', 'text': text},
      idempotencyKey: idempotencyKey,
      parse: parseIrisReceipt,
    );
  }

  @override
  Future<IrisResult<IrisReceipt>> receipt(String id) {
    if (!irisSendIdPattern.hasMatch(id)) throw ArgumentError.value(id, 'id');
    return _call('GET', '/v1/iris/send/$id', parse: parseIrisReceipt);
  }

  @override
  Future<IrisResult<IrisSummary>> summary() =>
      _call('GET', '/v1/iris/summary', parse: parseIrisSummary);

  @override
  Future<IrisResult<IrisEnrollment>> enroll(
    String publicKey,
    String fingerprint,
  ) => _call(
    'POST',
    '/v1/iris/devices/enroll',
    body: {'public_key': publicKey, 'fingerprint': fingerprint},
    parse: parseIrisEnrollment,
  );

  @override
  Future<IrisResult<IrisDevice>> device(String id) =>
      _call('GET', '/v1/iris/devices/${_id(id)}', parse: parseIrisDevice);

  @override
  Future<IrisResult<List<IrisDevice>>> devices() =>
      _call('GET', '/v1/iris/devices', parse: parseIrisDevices);

  @override
  Future<IrisResult<void>> revoke(String id) => _call<void>(
    'DELETE',
    '/v1/iris/devices/${_id(id)}',
    parse: (_) {},
    allowEmpty: true,
  );

  String _id(String id) {
    if (!irisIdPattern.hasMatch(id)) throw ArgumentError.value(id, 'id');
    return id;
  }

  /// One signed request; a 401 earns one silent token refresh and one retry
  /// with a fresh signature (a reused nonce would be refused).
  Future<IrisResult<T>> _call<T>(
    String method,
    String path, {
    required T? Function(Uint8List bytes) parse,
    Map<String, String>? query,
    Map<String, Object?>? body,
    String? idempotencyKey,
    int maxBytes = irisSmallMaxBytes,
    bool allowEmpty = false,
  }) async {
    final base = _base;
    if (base == null) {
      return const IrisErr(IrisFailure(IrisFailureKind.notConfigured));
    }
    final uri = base.replace(
      path: path,
      queryParameters: query == null || query.isEmpty ? null : query,
    );
    final bytes = body == null
        ? Uint8List(0)
        : Uint8List.fromList(utf8.encode(jsonEncode(body)));
    _Reply reply;
    try {
      var token = _usable(await _tokens.currentAccessToken());
      var refreshed = false;
      if (token == null) {
        token = _usable(await _tokens.refreshAccessToken());
        refreshed = true;
        if (token == null) {
          return const IrisErr(IrisFailure(IrisFailureKind.unauthorized));
        }
      }
      reply = await _exchange(
        method,
        uri,
        token,
        bytes,
        idempotencyKey,
        maxBytes,
      );
      if (reply.status == 401 && !refreshed) {
        final fresh = _usable(await _tokens.refreshAccessToken());
        if (fresh != null && fresh != token) {
          reply = await _exchange(
            method,
            uri,
            fresh,
            bytes,
            idempotencyKey,
            maxBytes,
          );
        }
      }
    } on Object {
      return const IrisErr(IrisFailure(IrisFailureKind.offline));
    }
    return _outcome(reply, parse, allowEmpty: allowEmpty);
  }

  IrisResult<T> _outcome<T>(
    _Reply reply,
    T? Function(Uint8List bytes) parse, {
    required bool allowEmpty,
  }) {
    final status = reply.status;
    if (status >= 200 && status < 300) {
      if (reply.tooLarge) {
        return const IrisErr(IrisFailure(IrisFailureKind.malformed));
      }
      if (allowEmpty) return IrisOk(parse(reply.bytes) as T);
      final value = parse(reply.bytes);
      return value == null
          ? const IrisErr(IrisFailure(IrisFailureKind.malformed))
          : IrisOk(value);
    }
    final error = irisErrorClass(reply.bytes);
    return IrisErr(switch (status) {
      0 => const IrisFailure(IrisFailureKind.offline),
      401 => const IrisFailure(IrisFailureKind.unauthorized),
      403 => const IrisFailure(IrisFailureKind.forbidden),
      400 => const IrisFailure(IrisFailureKind.badRequest),
      404 => const IrisFailure(IrisFailureKind.notFound),
      423 => const IrisFailure(IrisFailureKind.killed),
      429 => IrisFailure(
        IrisFailureKind.rateLimited,
        retryAfter: reply.retryAfter,
      ),
      503 when error == 'iris_killed' => const IrisFailure(
        IrisFailureKind.killed,
      ),
      _ => const IrisFailure(IrisFailureKind.unavailable),
    });
  }

  String? _usable(String? token) =>
      token == null || token.isEmpty ? null : token;

  Future<_Reply> _exchange(
    String method,
    Uri uri,
    String token,
    Uint8List body,
    String? idempotencyKey,
    int maxBytes,
  ) async {
    final abort = Completer<void>();
    try {
      return await _read(
        method,
        uri,
        token,
        body,
        idempotencyKey,
        maxBytes,
        abort.future,
      ).timeout(timeout);
    } on Object {
      return const _Reply(0);
    } finally {
      if (!abort.isCompleted) abort.complete();
    }
  }

  Future<_Reply> _read(
    String method,
    Uri uri,
    String token,
    Uint8List body,
    String? idempotencyKey,
    int maxBytes,
    Future<void> aborted,
  ) async {
    final signedPath = uri.hasQuery ? '${uri.path}?${uri.query}' : uri.path;
    final signature = await _signer.sign(
      method,
      signedPath,
      body,
      idempotencyKey: idempotencyKey,
    );
    final request = http.AbortableRequest(method, uri, abortTrigger: aborted)
      ..followRedirects = false
      ..headers.addAll({
        'Accept': 'application/json',
        'Authorization': 'Bearer $token',
        if (body.isNotEmpty) 'Content-Type': 'application/json',
        'Idempotency-Key': ?idempotencyKey,
        for (final name in IrisHeaders.all)
          if (signature[name] case final value?) name: value,
      });
    if (body.isNotEmpty) request.bodyBytes = body;
    final response = await _client.send(request);
    final status = response.statusCode;
    final cap = status >= 200 && status < 300 ? maxBytes : 1024;
    final declared = response.contentLength;
    final builder = BytesBuilder(copy: false);
    var tooLarge = declared != null && declared > cap;
    if (tooLarge) {
      await response.stream.listen(null).cancel();
    } else {
      await for (final chunk in response.stream) {
        builder.add(chunk);
        if (builder.length > cap) {
          tooLarge = true;
          break;
        }
      }
    }
    final retryAfter = int.tryParse(response.headers['retry-after'] ?? '');
    return _Reply(
      status,
      bytes: tooLarge ? null : builder.takeBytes(),
      tooLarge: tooLarge,
      retryAfter: retryAfter == null || retryAfter < 0 || retryAfter > 86400
          ? null
          : Duration(seconds: retryAfter),
    );
  }
}

final class _Reply {
  const _Reply(
    this.status, {
    Uint8List? bytes,
    this.tooLarge = false,
    this.retryAfter,
  }) : _bytes = bytes;

  final int status;
  final Uint8List? _bytes;
  final bool tooLarge;
  final Duration? retryAfter;

  Uint8List get bytes => _bytes ?? Uint8List(0);
}
