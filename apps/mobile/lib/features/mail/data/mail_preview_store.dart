import 'dart:async';
import 'dart:collection';

typedef MailPreviewFetch =
    Future<Map<String, dynamic>> Function(
      String mailboxId,
      String id, {
      required bool thread,
      required bool background,
    });

typedef MailPreviewPeek =
    Future<Map<String, dynamic>?> Function(
      String mailboxId,
      String id, {
      required bool thread,
    });

/// A detail and whether this view fetched it from the network. Details read
/// from the encrypted snapshot (or shown from memory) still need a
/// revalidation request when they are opened.
typedef MailPreview = ({Map<String, dynamic> detail, bool fromNetwork});

/// Opened and prefetched Mail details kept in memory for one signed-in
/// workspace view, so a reader can render its body in the opening frame.
///
/// Persistence stays with the repository's encrypted cache: [peekStored] is
/// consulted before the network, and [fetch] writes through it. Prefetching
/// is bounded (a short queue, [maxConcurrent] requests) and the queue is
/// replaced whenever the visible rows change, so a fling never fans out.
class MailPreviewStore {
  MailPreviewStore({
    required this.fetch,
    required this.peekStored,
    this.onError,
    this.capacity = 40,
    this.maxQueued = 8,
    this.maxConcurrent = 2,
  });

  final MailPreviewFetch fetch;
  final MailPreviewPeek peekStored;
  final void Function(Object error)? onError;
  final int capacity;
  final int maxQueued;
  final int maxConcurrent;

  final LinkedHashMap<String, MailPreview> _entries = LinkedHashMap();
  final Map<String, Future<MailPreview>> _inFlight = {};
  final Set<String> _failed = {};
  List<({String mailboxId, String id, bool thread})> _queue = const [];
  int _running = 0;
  bool _disposed = false;

  /// Number of loads started by prefetching; used by tests.
  int prefetchLoads = 0;

  static String _key(String mailboxId, String id, bool thread) =>
      '$mailboxId:${thread ? 't' : 'm'}:$id';

  MailPreview? peek(String mailboxId, String id, {required bool thread}) {
    final key = _key(mailboxId, id, thread);
    final entry = _entries.remove(key);
    if (entry != null) _entries[key] = entry;
    return entry;
  }

  void remember(
    String mailboxId,
    String id,
    Map<String, dynamic> detail, {
    required bool thread,
    required bool fromNetwork,
  }) {
    if (_disposed) return;
    final key = _key(mailboxId, id, thread);
    _entries
      ..remove(key)
      ..[key] = (detail: detail, fromNetwork: fromNetwork);
    _failed.remove(key);
    while (_entries.length > capacity) {
      _entries.remove(_entries.keys.first);
    }
  }

  /// Loads one detail for display: memory, then the encrypted store, then
  /// the network. Concurrent callers for the same id share one request.
  Future<MailPreview> load(
    String mailboxId,
    String id, {
    required bool thread,
    bool background = false,
  }) {
    final cached = peek(mailboxId, id, thread: thread);
    if (cached != null) return Future.value(cached);
    final key = _key(mailboxId, id, thread);
    return _inFlight[key] ??= () async {
      try {
        final stored = await peekStored(mailboxId, id, thread: thread);
        final preview = stored != null
            ? (detail: stored, fromNetwork: false)
            : (
                detail: await fetch(
                  mailboxId,
                  id,
                  thread: thread,
                  background: background,
                ),
                fromNetwork: true,
              );
        remember(
          mailboxId,
          id,
          preview.detail,
          thread: thread,
          fromNetwork: preview.fromNetwork,
        );
        return preview;
      } finally {
        // Drop the entry without touching the future other callers await.
        _inFlight.removeWhere((entry, _) => entry == key);
      }
    }();
  }

  /// Replaces the prefetch queue with [ids] (most likely first). Rows that
  /// scrolled away are dropped; requests already running finish and cache.
  void prefetch(
    String mailboxId,
    Iterable<String> ids, {
    required bool thread,
  }) {
    if (_disposed) return;
    _queue = [
      for (final id in ids)
        if (!_entries.containsKey(_key(mailboxId, id, thread)) &&
            !_inFlight.containsKey(_key(mailboxId, id, thread)) &&
            !_failed.contains(_key(mailboxId, id, thread)))
          (mailboxId: mailboxId, id: id, thread: thread),
    ].take(maxQueued).toList();
    _pump();
  }

  void cancel() => _queue = const [];

  void _pump() {
    while (!_disposed && _running < maxConcurrent && _queue.isNotEmpty) {
      final next = _queue.first;
      _queue = _queue.sublist(1);
      final key = _key(next.mailboxId, next.id, next.thread);
      if (_entries.containsKey(key) || _inFlight.containsKey(key)) continue;
      _running++;
      prefetchLoads++;
      unawaited(
        load(next.mailboxId, next.id, thread: next.thread, background: true)
            .then<void>(
              (_) {},
              onError: (Object error) {
                _failed.add(key);
                onError?.call(error);
              },
            )
            .whenComplete(() {
              _running--;
              _pump();
            }),
      );
    }
  }

  void clear() {
    _queue = const [];
    _entries.clear();
    _failed.clear();
  }

  void dispose() {
    _disposed = true;
    clear();
  }
}
