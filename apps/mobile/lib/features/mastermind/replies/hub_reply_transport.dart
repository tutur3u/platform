import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:mobile/features/mastermind/data/hub_config.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/replies/reply_outcome.dart';

/// POST /v1/replies against the owner-only hub Worker.
///
/// Same posture as the snapshot source: the bearer token is read per request
/// and lives only in that request's headers, nothing is logged or echoed, and a
/// failure collapses to a [ReplyOutcome]. A 401 earns one silent session
/// refresh and one retry with the same Idempotency-Key.
final class HubReplyTransport implements MastermindReplyTransport {
  HubReplyTransport({
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
  static final _errorClass = RegExp(r'^[a-z_]{1,40}$');

  final Uri? _base;
  final AccessTokenProvider _tokens;
  final http.Client _client;
  final bool _ownsClient;
  final Duration timeout;

  bool get isConfigured => _base != null;

  void close() {
    if (_ownsClient) _client.close();
  }

  @override
  Future<ReplyOutcome> send(OutboxEntry entry) async {
    final base = _base;
    if (base == null) return const ReplyUnavailable();
    try {
      final body = utf8.encode(jsonEncode(entry.toRequestJson()));
      final uri = base.replace(path: '/v1/replies');
      var token = await _usable(_tokens.currentAccessToken());
      var refreshed = false;
      if (token == null) {
        token = await _usable(_tokens.refreshAccessToken());
        refreshed = true;
        if (token == null) return const ReplyUnauthorized();
      }
      var reply = await _post(uri, token, entry.idempotencyKey, body);
      if (reply.status == 401 && !refreshed) {
        final fresh = await _usable(_tokens.refreshAccessToken());
        if (fresh != null && fresh != token) {
          reply = await _post(uri, fresh, entry.idempotencyKey, body);
        }
      }
      return _outcome(reply);
    } on Object {
      return const ReplyUnavailable();
    }
  }

  Future<String?> _usable(Future<String?> token) async {
    final value = await token;
    return value == null || value.isEmpty ? null : value;
  }

  ReplyOutcome _outcome(_Reply reply) => switch (reply.status) {
    201 => const ReplyAccepted(),
    200 => const ReplyAccepted(replayed: true),
    400 => ReplyRejected(unsafeText: reply.errorClass == 'unsafe_text'),
    401 => const ReplyUnauthorized(),
    403 => ReplyForbidden(disabled: reply.errorClass == 'replies_disabled'),
    409 => switch (reply.errorClass) {
      'stale_item' => const ReplyStale(),
      'idempotency_conflict' => const ReplyKeyConflict(),
      _ => const ReplyUnavailable(),
    },
    413 => const ReplyTooLarge(),
    429 => ReplyRateLimited(retryAfter: reply.retryAfter),
    _ => const ReplyUnavailable(),
  };

  Future<_Reply> _post(
    Uri uri,
    String token,
    String key,
    List<int> body,
  ) async {
    final abort = Completer<void>();
    try {
      return await _exchange(uri, token, key, body, abort.future).timeout(
        timeout,
        onTimeout: () {
          if (!abort.isCompleted) abort.complete();
          throw TimeoutException(null);
        },
      );
    } on Object {
      if (!abort.isCompleted) abort.complete();
      rethrow;
    }
  }

  Future<_Reply> _exchange(
    Uri uri,
    String token,
    String key,
    List<int> body,
    Future<void> aborted,
  ) async {
    final request = http.AbortableRequest('POST', uri, abortTrigger: aborted)
      ..followRedirects = false
      ..headers.addAll({
        'Accept': 'application/json',
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      })
      ..bodyBytes = body;
    final response = await _client.send(request);
    // Only the status and an error class matter; a body is never kept whole.
    final bytes = <int>[];
    await for (final chunk in response.stream) {
      if (bytes.length < _maxErrorBytes) bytes.addAll(chunk);
    }
    return _Reply(
      response.statusCode,
      errorClass: _errorClassOf(bytes),
      retryAfter: _retryAfterOf(response.headers['retry-after']),
    );
  }

  String? _errorClassOf(List<int> bytes) {
    try {
      final decoded = jsonDecode(utf8.decode(bytes));
      final value = decoded is Map<String, dynamic> ? decoded['error'] : null;
      return value is String && _errorClass.hasMatch(value) ? value : null;
    } on FormatException {
      return null;
    }
  }

  /// Delta-seconds only; an HTTP date or anything else is treated as absent.
  Duration? _retryAfterOf(String? value) {
    final seconds = value == null ? null : int.tryParse(value.trim());
    if (seconds == null || seconds < 0) return null;
    final delay = Duration(seconds: seconds);
    return delay > _maxRetryAfter ? _maxRetryAfter : delay;
  }
}

final class _Reply {
  const _Reply(this.status, {this.errorClass, this.retryAfter});
  final int status;
  final String? errorClass;
  final Duration? retryAfter;
}
