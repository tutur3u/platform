import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/features/mastermind/data/hub_capabilities.dart';
import 'package:mobile/features/mastermind/data/hub_config.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/parse/event_feed_parser.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';

/// Reads the owner-only Mastermind hub Worker over HTTPS.
///
/// The bearer token is read from [AccessTokenProvider] for every request and
/// lives only in that request's headers. Nothing here logs, stores or echoes a
/// token, header, body or URL; failures collapse to [SnapshotUnavailableKind].
/// An `unavailable` outcome records only its reason (a status code, timeout,
/// transport error type, header or size refusal) through `diagnostics`.
final class HubHttpSnapshotSource implements MastermindSnapshotSource {
  HubHttpSnapshotSource({
    required Uri? baseUrl,
    required AccessTokenProvider tokens,
    http.Client? client,
    this.timeout = const Duration(seconds: 20),
    DateTime Function()? clock,
    void Function(String message)? diagnostics,
  }) : _base = baseUrl == null
           ? null
           : MastermindHubConfig.parseBaseUrl(baseUrl.toString()),
       _tokens = tokens,
       _client = client ?? http.Client(),
       _ownsClient = client == null,
       _clock = clock ?? DateTime.now,
       _diagnostics = diagnostics ?? _debugLog;

  /// Matches the snapshot limit the parser and the cache enforce.
  static const int maxSnapshotBytes = mastermindSnapshotMaxBytes;

  /// Matches the events page limit its parser enforces.
  static const int maxEventsBytes = mastermindEventFeedMaxBytes;
  static const _maxErrorBytes = 1024;
  static const _maxCapabilityBytes = 4096;
  static final _digestPattern = RegExp(r'^[a-f0-9]{64}$');

  final Uri? _base;
  final AccessTokenProvider _tokens;
  final http.Client _client;
  final bool _ownsClient;
  final DateTime Function() _clock;
  final void Function(String message) _diagnostics;
  final Duration timeout;

  static void _debugLog(String message) => debugPrint(message);

  /// Releases the HTTP client this source created. An injected client belongs
  /// to its caller and is left open.
  void close() {
    if (_ownsClient) _client.close();
  }

  @override
  bool get isConfigured => _base != null;

  @override
  Future<SnapshotFetch> fetchSnapshot({String? ifNoneMatch}) async {
    final base = _base;
    if (base == null) {
      return const SnapshotFetch.unavailable(
        SnapshotUnavailableKind.notConfigured,
      );
    }
    final requested = _digestFromEtag(ifNoneMatch);
    final reply = await _get(
      base.replace(path: '/v1/snapshot'),
      ifNoneMatch: requested,
      maxBytes: maxSnapshotBytes,
    );
    final receivedAt = _clock().toUtc();
    switch (reply.status) {
      case 200:
        if (reply.tooLarge) return _unavailableSnapshot('too-large');
        final digest = snapshotDigestFromHeaders(
          hubDigest: reply.hubDigest,
          etag: reply.etag,
        );
        if (digest == null) return _unavailableSnapshot(reply.headerShape);
        return SnapshotFetch.ok(reply.bytes, receivedAt, digest: digest);
      case 304:
        if (requested == null) return _unavailableSnapshot('unexpected-304');
        final hasHeader = reply.hubDigest != null || reply.etag != null;
        final digest = hasHeader
            ? snapshotDigestFromHeaders(
                hubDigest: reply.hubDigest,
                etag: reply.etag,
              )
            : requested;
        if (digest == null) return _unavailableSnapshot(reply.headerShape);
        // A digest that differs from the one sent is rejected by the cubit.
        return SnapshotFetch.notModified(digest, receivedAt);
      default:
        return SnapshotFetch.unavailable(
          _kindFor(reply, events: false, route: 'snapshot'),
        );
    }
  }

  SnapshotFetch _unavailableSnapshot(String reason) {
    _diagnose('snapshot', reason);
    return const SnapshotFetch.unavailable(SnapshotUnavailableKind.unavailable);
  }

  EventsFetch _unavailableEvents(String reason) {
    _diagnose('events', reason);
    return const EventsFetch.unavailable(SnapshotUnavailableKind.unavailable);
  }

  /// Debug-level breadcrumb for an `unavailable` outcome. [reason] is built
  /// only from fixed strings, status codes and error types: never a token,
  /// header value, URL or body.
  void _diagnose(String route, String reason) {
    try {
      _diagnostics('Mastermind hub $route unavailable: $reason');
    } on Object {
      // Diagnostics never change the fetch outcome.
    }
  }

  @override
  Future<EventsFetch> fetchEvents({
    required String digest,
    required int afterSeq,
    int limit = 100,
  }) async {
    RangeError.checkNotNegative(afterSeq, 'afterSeq');
    RangeError.checkValueInInterval(limit, 1, 200, 'limit');
    final base = _base;
    if (base == null) {
      return const EventsFetch.unavailable(
        SnapshotUnavailableKind.notConfigured,
      );
    }
    // No export can carry a malformed digest; never put one on the wire.
    if (!_digestPattern.hasMatch(digest)) {
      return const EventsFetch.unavailable(
        SnapshotUnavailableKind.digestNotFound,
      );
    }
    final reply = await _get(
      base.replace(
        path: '/v1/events',
        queryParameters: {
          'digest': digest,
          'after_seq': '$afterSeq',
          'limit': '$limit',
        },
      ),
      maxBytes: maxEventsBytes,
    );
    if (reply.status != 200) {
      return EventsFetch.unavailable(
        _kindFor(reply, events: true, route: 'events'),
      );
    }
    if (reply.tooLarge) return _unavailableEvents('too-large');
    final replied = reply.hubDigest;
    if (replied != null && replied != digest) {
      return _unavailableEvents('digest-mismatch');
    }
    final parsed = parseMastermindEventFeed(reply.bytes);
    if (parsed is! EventFeedParseAccepted) {
      return _unavailableEvents('malformed-body');
    }
    return EventsFetch.ok(parsed.feed, digest, _clock().toUtc());
  }

  /// GET /v1/capabilities. Not part of the snapshot interface: only the live
  /// source has a Worker to ask.
  Future<CapabilitiesFetch> fetchCapabilities() async {
    final base = _base;
    if (base == null) {
      return const CapabilitiesFetchUnavailable(
        SnapshotUnavailableKind.notConfigured,
      );
    }
    final reply = await _get(
      base.replace(path: '/v1/capabilities'),
      maxBytes: _maxCapabilityBytes,
    );
    if (reply.status == 200) {
      final capabilities = reply.tooLarge
          ? null
          : MastermindCapabilities.parse(reply.bytes);
      if (capabilities != null) return CapabilitiesFetchOk(capabilities);
      _diagnose(
        'capabilities',
        reply.tooLarge ? 'too-large' : 'malformed-body',
      );
      return const CapabilitiesFetchUnavailable(
        SnapshotUnavailableKind.unavailable,
      );
    }
    final kind = _kindFor(reply, events: false, route: 'capabilities');
    return CapabilitiesFetchUnavailable(
      // A Worker without the route is simply unavailable, not "no snapshot".
      kind == SnapshotUnavailableKind.noSnapshot
          ? SnapshotUnavailableKind.unavailable
          : kind,
    );
  }

  SnapshotUnavailableKind _kindFor(
    _Reply reply, {
    required bool events,
    required String route,
  }) {
    final kind = _statusKind(reply, events: events);
    if (kind == SnapshotUnavailableKind.unavailable) {
      _diagnose(route, reply.failure ?? 'status ${reply.status}');
    }
    return kind;
  }

  SnapshotUnavailableKind _statusKind(_Reply reply, {required bool events}) {
    switch (reply.status) {
      case 401:
        return SnapshotUnavailableKind.unauthorized;
      case 403:
        return SnapshotUnavailableKind.forbidden;
      case 404:
        if (!events || reply.errorClass == 'no_snapshot') {
          return SnapshotUnavailableKind.noSnapshot;
        }
        return SnapshotUnavailableKind.digestNotFound;
      case 409:
        return events && reply.errorClass == 'cursor_ahead'
            ? SnapshotUnavailableKind.cursorAhead
            : SnapshotUnavailableKind.unavailable;
      default:
        return SnapshotUnavailableKind.unavailable;
    }
  }

  /// One request; a 401 earns exactly one silent refresh and one retry.
  ///
  /// A 401 reply means access is lost only when the token provider confirms the
  /// session is gone (it returns null). A provider that throws, or a request
  /// that fails or times out, is a [_Reply.failed] here: the hub is
  /// unavailable, which never clears cached data.
  Future<_Reply> _get(
    Uri uri, {
    required int maxBytes,
    String? ifNoneMatch,
  }) async {
    try {
      var token = _usable(await _tokens.currentAccessToken());
      var refreshed = false;
      if (token == null) {
        token = _usable(await _tokens.refreshAccessToken());
        refreshed = true;
        if (token == null) return _Reply(401);
      }
      var reply = await _exchange(uri, token, ifNoneMatch, maxBytes);
      if (reply.status == 401 && !refreshed) {
        final fresh = _usable(await _tokens.refreshAccessToken());
        if (fresh != null && fresh != token) {
          reply = await _exchange(uri, fresh, ifNoneMatch, maxBytes);
        }
      }
      return reply;
    } on Object {
      return _Reply.failed('token-provider');
    }
  }

  String? _usable(String? token) =>
      token == null || token.isEmpty ? null : token;

  /// Runs the request under [timeout]. On expiry the request is aborted and the
  /// body subscription cancelled, so a stalled hub cannot hold the socket.
  Future<_Reply> _exchange(
    Uri uri,
    String token,
    String? ifNoneMatch,
    int maxBytes,
  ) async {
    final abort = Completer<void>();
    try {
      return await _read(
        uri,
        token,
        ifNoneMatch,
        maxBytes,
        abort.future,
      ).timeout(
        timeout,
        onTimeout: () {
          if (!abort.isCompleted) abort.complete();
          throw TimeoutException(null);
        },
      );
    } on TimeoutException {
      if (!abort.isCompleted) abort.complete();
      return _Reply.failed('timeout');
    } on Object catch (error) {
      if (!abort.isCompleted) abort.complete();
      return _Reply.failed('transport ${error.runtimeType}');
    }
  }

  Future<_Reply> _read(
    Uri uri,
    String token,
    String? ifNoneMatch,
    int maxBytes,
    Future<void> aborted,
  ) async {
    final request = http.AbortableRequest('GET', uri, abortTrigger: aborted)
      ..followRedirects = false
      ..headers.addAll({
        'Accept': 'application/json',
        'Authorization': 'Bearer $token',
        if (ifNoneMatch != null) 'If-None-Match': '"$ifNoneMatch"',
      });
    final response = await _client.send(request);
    final status = response.statusCode;
    final cap = status == 200 ? maxBytes : _maxErrorBytes;
    final declared = response.contentLength;
    var tooLarge = declared != null && declared > cap;
    final builder = BytesBuilder(copy: false);
    if (tooLarge) {
      // Cancel the transfer instead of buffering a body we will refuse.
      await response.stream.listen(null).cancel();
    } else {
      tooLarge = await _drain(response.stream, builder, cap, aborted);
    }
    return _Reply(
      status,
      hubDigest: response.headers['x-hub-digest'],
      etag: response.headers['etag'],
      bytes: tooLarge ? Uint8List(0) : builder.takeBytes(),
      tooLarge: tooLarge,
    );
  }

  /// Buffers [stream] into [builder] up to [cap] bytes; true when it is larger.
  /// The subscription is cancelled on overflow or [aborted], so a body that
  /// stalls after the headers neither hangs the caller nor leaks the transfer.
  Future<bool> _drain(
    Stream<List<int>> stream,
    BytesBuilder builder,
    int cap,
    Future<void> aborted,
  ) {
    final done = Completer<bool>();
    late final StreamSubscription<List<int>> subscription;
    subscription = stream.listen(
      (chunk) {
        builder.add(chunk);
        if (builder.length > cap && !done.isCompleted) {
          unawaited(subscription.cancel());
          done.complete(true);
        }
      },
      onError: (Object error, StackTrace stack) {
        if (!done.isCompleted) done.completeError(error, stack);
      },
      onDone: () {
        if (!done.isCompleted) done.complete(false);
      },
      cancelOnError: true,
    );
    unawaited(
      aborted.then((_) {
        unawaited(subscription.cancel());
        if (!done.isCompleted) done.completeError(TimeoutException(null));
      }),
    );
    return done.future;
  }

  /// Accepts a strong or weak quoted ETag, or a bare digest. The request
  /// always carries the strong form `"<digest>"`.
  String? _digestFromEtag(String? value) {
    if (value == null) return null;
    final quoted = snapshotDigestFromEtag(value);
    if (quoted != null) return quoted;
    return _digestPattern.hasMatch(value) ? value : null;
  }
}

final class _Reply {
  _Reply(
    this.status, {
    this.hubDigest,
    this.etag,
    Uint8List? bytes,
    this.tooLarge = false,
  }) : bytes = bytes ?? Uint8List(0),
       failure = null;

  /// No HTTP status: the request timed out or failed before a reply.
  _Reply.failed(String this.failure)
    : status = 0,
      hubDigest = null,
      etag = null,
      bytes = Uint8List(0),
      tooLarge = false;

  final int status;
  final String? hubDigest;
  final String? etag;
  final Uint8List bytes;
  final bool tooLarge;

  /// Why no reply arrived; fixed strings and error types only.
  final String? failure;

  /// Which digest headers were present, never their values.
  String get headerShape {
    if (hubDigest == null && etag == null) return 'bad-headers none';
    final names = [
      if (hubDigest != null) 'x-hub-digest',
      if (etag case final tag?)
        if (tag.startsWith('W/')) 'etag weak' else 'etag',
    ];
    return 'bad-headers ${names.join('+')}';
  }

  /// `{"error":"<class>"}` from a non-200 reply; never anything else.
  String? get errorClass {
    try {
      final decoded = jsonDecode(utf8.decode(bytes));
      final value = decoded is Map<String, dynamic> ? decoded['error'] : null;
      return value is String && RegExp(r'^[a-z_]{1,40}$').hasMatch(value)
          ? value
          : null;
    } on FormatException {
      return null;
    }
  }
}
