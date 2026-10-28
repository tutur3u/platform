import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:mobile/features/mastermind/data/hub_capabilities.dart';
import 'package:mobile/features/mastermind/data/hub_config.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/parse/event_feed_parser.dart';

/// Reads the owner-only Mastermind hub Worker over HTTPS.
///
/// The bearer token is read from [AccessTokenProvider] for every request and
/// lives only in that request's headers. Nothing here logs, stores or echoes a
/// token, header, body or URL; failures collapse to [SnapshotUnavailableKind].
final class HubHttpSnapshotSource implements MastermindSnapshotSource {
  HubHttpSnapshotSource({
    required Uri? baseUrl,
    required AccessTokenProvider tokens,
    http.Client? client,
    this.timeout = const Duration(seconds: 20),
    DateTime Function()? clock,
  }) : _base = baseUrl == null
           ? null
           : MastermindHubConfig.parseBaseUrl(baseUrl.toString()),
       _tokens = tokens,
       _client = client ?? http.Client(),
       _ownsClient = client == null,
       _clock = clock ?? DateTime.now;

  /// Matches the formatted snapshot limit the parsers enforce.
  static const maxSnapshotBytes = 600000;
  static const _maxErrorBytes = 1024;
  static const _maxCapabilityBytes = 4096;
  static final _digestPattern = RegExp(r'^[a-f0-9]{64}$');

  final Uri? _base;
  final AccessTokenProvider _tokens;
  final http.Client _client;
  final bool _ownsClient;
  final DateTime Function() _clock;
  final Duration timeout;

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
    switch (reply?.status) {
      case 200:
        final digest = snapshotDigestFromHeaders(
          hubDigest: reply!.hubDigest,
          etag: reply.etag,
        );
        if (digest == null || reply.tooLarge) {
          return const SnapshotFetch.unavailable(
            SnapshotUnavailableKind.unavailable,
          );
        }
        return SnapshotFetch.ok(reply.bytes, receivedAt, digest: digest);
      case 304:
        if (requested == null) {
          return const SnapshotFetch.unavailable(
            SnapshotUnavailableKind.unavailable,
          );
        }
        final hasHeader = reply!.hubDigest != null || reply.etag != null;
        final digest = hasHeader
            ? snapshotDigestFromHeaders(
                hubDigest: reply.hubDigest,
                etag: reply.etag,
              )
            : requested;
        if (digest == null) {
          return const SnapshotFetch.unavailable(
            SnapshotUnavailableKind.unavailable,
          );
        }
        // A digest that differs from the one sent is rejected by the cubit.
        return SnapshotFetch.notModified(digest, receivedAt);
      default:
        return SnapshotFetch.unavailable(_kindFor(reply, events: false));
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
      maxBytes: maxSnapshotBytes,
    );
    if (reply?.status != 200) {
      return EventsFetch.unavailable(_kindFor(reply, events: true));
    }
    final replied = reply!.hubDigest;
    if (reply.tooLarge || (replied != null && replied != digest)) {
      return const EventsFetch.unavailable(SnapshotUnavailableKind.unavailable);
    }
    final parsed = parseMastermindEventFeed(reply.bytes);
    if (parsed is! EventFeedParseAccepted) {
      return const EventsFetch.unavailable(SnapshotUnavailableKind.unavailable);
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
    if (reply?.status == 200 && !reply!.tooLarge) {
      final capabilities = MastermindCapabilities.parse(reply.bytes);
      if (capabilities != null) return CapabilitiesFetchOk(capabilities);
    }
    final kind = _kindFor(reply, events: false);
    return CapabilitiesFetchUnavailable(
      // A Worker without the route is simply unavailable, not "no snapshot".
      kind == SnapshotUnavailableKind.noSnapshot
          ? SnapshotUnavailableKind.unavailable
          : kind,
    );
  }

  SnapshotUnavailableKind _kindFor(_Reply? reply, {required bool events}) {
    switch (reply?.status) {
      case 401:
        return SnapshotUnavailableKind.unauthorized;
      case 403:
        return SnapshotUnavailableKind.forbidden;
      case 404:
        if (!events || reply!.errorClass == 'no_snapshot') {
          return SnapshotUnavailableKind.noSnapshot;
        }
        return SnapshotUnavailableKind.digestNotFound;
      case 409:
        return events && reply!.errorClass == 'cursor_ahead'
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
  /// that fails or times out, is null here: the hub is unavailable, which
  /// never clears cached data.
  Future<_Reply?> _get(
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
      if (reply?.status == 401 && !refreshed) {
        final fresh = _usable(await _tokens.refreshAccessToken());
        if (fresh != null && fresh != token) {
          reply = await _exchange(uri, fresh, ifNoneMatch, maxBytes);
        }
      }
      return reply;
    } on Object {
      return null;
    }
  }

  String? _usable(String? token) =>
      token == null || token.isEmpty ? null : token;

  /// Runs the request under [timeout]. On expiry the request is aborted and the
  /// body subscription cancelled, so a stalled hub cannot hold the socket.
  Future<_Reply?> _exchange(
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
    } on Object {
      if (!abort.isCompleted) abort.complete();
      return null;
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

  String? _digestFromEtag(String? value) {
    if (value == null) return null;
    final quoted = snapshotDigestFromHeaders(etag: value);
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
  }) : bytes = bytes ?? Uint8List(0);

  final int status;
  final String? hubDigest;
  final String? etag;
  final Uint8List bytes;
  final bool tooLarge;

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
