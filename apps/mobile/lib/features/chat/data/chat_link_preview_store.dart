import 'dart:async';

import 'package:mobile/features/chat/models/chat_models.dart';

typedef ChatLinkPreviewFetch =
    Future<List<ChatLinkPreview>> Function(
      String wsId,
      String conversationId,
      List<String> urls,
    );

/// Link previews for message links, fetched by the server's preview route
/// and kept in memory. The device never requests the linked pages itself:
/// the server resolves them with its own SSRF guards and stored results.
///
/// Matches web: at most [maxUrls] distinct links per message, previews kept
/// for [ttl], one request in flight per message link set, and a failed
/// request is not repeated for [retryAfter] so scrolling cannot hammer it.
class ChatLinkPreviewStore {
  ChatLinkPreviewStore({
    required ChatLinkPreviewFetch fetch,
    this.ttl = const Duration(hours: 1),
    this.retryAfter = const Duration(minutes: 1),
    this.capacity = 200,
    DateTime Function()? now,
  }) : _fetch = fetch,
       _now = now ?? DateTime.now;

  static const maxUrls = 5;

  final ChatLinkPreviewFetch _fetch;
  final DateTime Function() _now;
  final Duration ttl;
  final Duration retryAfter;

  /// Most link sets kept; the oldest is dropped first.
  final int capacity;

  // Map literals keep insertion order, so the first key is the oldest.
  final _entries = <String, ({List<ChatLinkPreview> previews, DateTime at})>{};
  final _failedAt = <String, DateTime>{};
  final _inFlight = <String, Future<List<ChatLinkPreview>>>{};

  static String _key(String wsId, String conversationId, List<String> urls) =>
      [wsId, conversationId, ...urls].join('\n');

  /// Previews already fetched for [urls], or null when they are not cached
  /// or are older than [ttl].
  List<ChatLinkPreview>? cached(
    String wsId,
    String conversationId,
    List<String> urls,
  ) {
    final entry = _entries[_key(wsId, conversationId, urls)];
    if (entry == null || _now().difference(entry.at) >= ttl) return null;
    return entry.previews;
  }

  /// Previews for [urls]: the cache, a request already in flight, or a new
  /// request. Failures resolve to no previews.
  Future<List<ChatLinkPreview>> load(
    String wsId,
    String conversationId,
    List<String> urls,
  ) {
    if (urls.isEmpty) return Future.value(const []);
    final hit = cached(wsId, conversationId, urls);
    if (hit != null) return Future.value(hit);
    final key = _key(wsId, conversationId, urls);
    final failed = _failedAt[key];
    if (failed != null && _now().difference(failed) < retryAfter) {
      return Future.value(const []);
    }
    return _inFlight[key] ??= _request(key, wsId, conversationId, urls);
  }

  Future<List<ChatLinkPreview>> _request(
    String key,
    String wsId,
    String conversationId,
    List<String> urls,
  ) async {
    try {
      final previews = await _fetch(wsId, conversationId, urls);
      _failedAt.remove(key);
      _entries
        ..remove(key)
        ..[key] = (previews: previews, at: _now());
      while (_entries.length > capacity) {
        _entries.remove(_entries.keys.first);
      }
      return previews;
    } on Object {
      _failedAt[key] = _now();
      return const [];
    } finally {
      unawaited(_inFlight.remove(key));
    }
  }
}
