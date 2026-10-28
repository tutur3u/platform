import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:mobile/features/mastermind/data/hub_config.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_models.dart';

/// Why a threads read gave nothing to show.
enum ThreadsProblem {
  /// 404, `read: false`, a kill switch, or a thread whose history tier is
  /// `none`: "Not available on mobile".
  notAvailable,

  /// The thread left the index.
  gone,

  /// 410 `digest_gone`: the history the page was pinned to was replaced.
  digestGone,

  /// 429: "Limit reached".
  rateLimited,

  /// 401 after one silent refresh, or 403 without a grant.
  accessLost,

  /// Anything else: offline, a timeout, a 5xx, or a body that drifted.
  unavailable,
}

sealed class ThreadsFetch<T> {
  const ThreadsFetch();
}

final class ThreadsFetchOk<T> extends ThreadsFetch<T> {
  const ThreadsFetchOk(this.value);
  final T value;
}

final class ThreadsFetchFailed<T> extends ThreadsFetch<T> {
  const ThreadsFetchFailed(this.problem, {this.retryAfter});
  final ThreadsProblem problem;
  final Duration? retryAfter;
}

abstract interface class ThreadHistorySource {
  Future<ThreadsFetch<ThreadsCapabilities>> capabilities();
  Future<ThreadsFetch<List<ThreadIndexEntry>>> index();

  /// One page pinned to [digest]; [before] pages backwards.
  Future<ThreadsFetch<ThreadHistoryPage>> messages({
    required String ref,
    required String digest,
    required int limit,
    String? before,
  });

  void close();
}

/// GET-only reader for the owner `/v1/threads/*` routes (D §2.1).
///
/// Same posture as the snapshot source: the bearer token is read per request
/// and lives only in that request's headers; no redirect is followed; nothing
/// is logged, stored or echoed; bodies are capped before they are decoded.
/// Nothing it returns is written to disk.
final class HubThreadHistorySource implements ThreadHistorySource {
  HubThreadHistorySource({
    required Uri? baseUrl,
    required AccessTokenProvider tokens,
    http.Client? client,
    this.timeout = const Duration(seconds: 20),
  }) : _base = baseUrl == null
           ? null
           : MastermindHubConfig.parseBaseUrl(baseUrl.toString()),
       _tokens = tokens,
       _client = client ?? http.Client(),
       _ownsClient = client == null;

  static const _maxErrorBytes = 1024;
  static const _maxRetryAfter = Duration(hours: 1);

  final Uri? _base;
  final AccessTokenProvider _tokens;
  final http.Client _client;
  final bool _ownsClient;
  final Duration timeout;

  bool get isConfigured => _base != null;

  @override
  void close() {
    if (_ownsClient) _client.close();
  }

  @override
  Future<ThreadsFetch<ThreadsCapabilities>> capabilities() => _fetch(
    '/v1/threads/capabilities',
    null,
    threadsCapabilitiesMaxBytes,
    parseThreadsCapabilities,
  );

  @override
  Future<ThreadsFetch<List<ThreadIndexEntry>>> index() =>
      _fetch('/v1/threads', null, threadsIndexMaxBytes, parseThreadIndex);

  @override
  Future<ThreadsFetch<ThreadHistoryPage>> messages({
    required String ref,
    required String digest,
    required int limit,
    String? before,
  }) {
    RangeError.checkValueInInterval(limit, 1, 50, 'limit');
    if (!threadRefPattern.hasMatch(ref)) {
      return Future.value(
        const ThreadsFetchFailed(ThreadsProblem.notAvailable),
      );
    }
    return _fetch(
      '/v1/threads/$ref/messages',
      {'digest': digest, 'before': ?before, 'limit': '$limit'},
      threadsPageMaxBytes,
      (bytes) {
        final page = parseThreadHistoryPage(bytes);
        // A page for another thread or another digest is drift, not data.
        return page != null && page.ref == ref && page.digest == digest
            ? page
            : null;
      },
    );
  }

  Future<ThreadsFetch<T>> _fetch<T extends Object>(
    String path,
    Map<String, String>? query,
    int maxBytes,
    T? Function(Uint8List bytes) parse,
  ) async {
    final base = _base;
    if (base == null) {
      return const ThreadsFetchFailed(ThreadsProblem.notAvailable);
    }
    final uri = base.replace(path: path, queryParameters: query);
    try {
      var token = await _usable(_tokens.currentAccessToken());
      var refreshed = false;
      if (token == null) {
        token = await _usable(_tokens.refreshAccessToken());
        refreshed = true;
        if (token == null) {
          return const ThreadsFetchFailed(ThreadsProblem.accessLost);
        }
      }
      var reply = await _get(uri, token, maxBytes);
      if (reply.status == 401 && !refreshed) {
        final fresh = await _usable(_tokens.refreshAccessToken());
        if (fresh == null) {
          return const ThreadsFetchFailed(ThreadsProblem.accessLost);
        }
        reply = await _get(uri, fresh, maxBytes);
      }
      if (reply.status == 200) {
        final value = reply.tooLarge ? null : parse(reply.bytes);
        if (value == null) {
          return const ThreadsFetchFailed(ThreadsProblem.unavailable);
        }
        return ThreadsFetchOk<T>(value);
      }
      return ThreadsFetchFailed(
        _problem(reply),
        retryAfter: reply.status == 429 ? reply.retryAfter : null,
      );
    } on Object {
      return const ThreadsFetchFailed(ThreadsProblem.unavailable);
    }
  }

  static ThreadsProblem _problem(_Reply reply) => switch (reply.status) {
    // The read kill switch: the hub is reachable, history is just off.
    403 when _errorClass(reply.bytes) == 'threads_disabled' =>
      ThreadsProblem.notAvailable,
    401 || 403 => ThreadsProblem.accessLost,
    404 => ThreadsProblem.notAvailable,
    410 => ThreadsProblem.digestGone,
    429 => ThreadsProblem.rateLimited,
    _ => ThreadsProblem.unavailable,
  };

  /// `{"error":"<class>"}` from a refusal; null for anything else.
  static String? _errorClass(Uint8List bytes) {
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

  Future<String?> _usable(Future<String?> token) async {
    final value = await token;
    return value == null || value.isEmpty ? null : value;
  }

  Future<_Reply> _get(Uri uri, String token, int maxBytes) async {
    final abort = Completer<void>();
    try {
      return await _read(uri, token, maxBytes, abort.future).timeout(
        timeout,
        onTimeout: () {
          if (!abort.isCompleted) abort.complete();
          throw TimeoutException(null);
        },
      );
    } finally {
      if (!abort.isCompleted) abort.complete();
    }
  }

  Future<_Reply> _read(
    Uri uri,
    String token,
    int maxBytes,
    Future<void> aborted,
  ) async {
    final request = http.AbortableRequest('GET', uri, abortTrigger: aborted)
      ..followRedirects = false
      ..headers.addAll({
        'Accept': 'application/json',
        'Authorization': 'Bearer $token',
      });
    final response = await _client.send(request);
    final status = response.statusCode;
    final cap = status == 200 ? maxBytes : _maxErrorBytes;
    final builder = BytesBuilder(copy: false);
    var tooLarge = (response.contentLength ?? 0) > cap;
    if (!tooLarge) {
      await for (final chunk in response.stream) {
        builder.add(chunk);
        if (builder.length > cap) {
          tooLarge = true;
          break;
        }
      }
    } else {
      // Refuse a declared-oversized body without buffering it.
      await response.stream.listen(null).cancel();
    }
    return _Reply(
      status,
      bytes: tooLarge ? Uint8List(0) : builder.takeBytes(),
      tooLarge: tooLarge,
      retryAfter: _retryAfterOf(response.headers['retry-after']),
    );
  }

  /// Delta-seconds only; an HTTP date or anything else is treated as absent.
  static Duration? _retryAfterOf(String? value) {
    final seconds = value == null ? null : int.tryParse(value.trim());
    if (seconds == null || seconds < 0) return null;
    final delay = Duration(seconds: seconds);
    return delay > _maxRetryAfter ? _maxRetryAfter : delay;
  }
}

final class _Reply {
  const _Reply(
    this.status, {
    required this.bytes,
    required this.tooLarge,
    this.retryAfter,
  });
  final int status;
  final Uint8List bytes;
  final bool tooLarge;
  final Duration? retryAfter;
}
