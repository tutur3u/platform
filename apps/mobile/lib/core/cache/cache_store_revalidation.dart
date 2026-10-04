part of 'cache_store.dart';

abstract final class _CacheRevalidationScope {
  static final Object _key = Object();
  static final Object _snapshotKey = Object();
  static final Object _cycleKey = Object();

  /// A completed request is reusable only within this explicit refresh cycle.
  /// The revision-bearing key prevents reuse after invalidation or scope clear.
  static Future<Object?> refresh(
    CacheStore store,
    String key,
    Future<Object?> Function() operation,
  ) {
    final cycle = Zone.current[_cycleKey];
    if (cycle is! _RevalidationCycle) return operation();
    return cycle.requests.putIfAbsent((store, key), operation);
  }

  static void recordSnapshot() {
    final capture = Zone.current[_snapshotKey];
    if (capture is _SnapshotReadCapture) capture.usedCache = true;
  }

  static Future<T> read<T>(
    Future<T> Function() operation,
    void Function(T) onSnapshot,
  ) async {
    if (active) return await operation();
    final capture = _SnapshotReadCapture();
    final cycle = Zone.current[_cycleKey] ?? _RevalidationCycle();
    final value = await runZoned(
      operation,
      zoneValues: {_snapshotKey: capture, _cycleKey: cycle},
    );
    if (!capture.usedCache) return value;
    onSnapshot(value);
    return await runZoned(
      operation,
      zoneValues: {_key: true, _cycleKey: cycle},
    );
  }

  static bool get active => Zone.current[_key] == true;

  static Future<T> run<T>(Future<T> Function() operation) => runZoned(
    operation,
    zoneValues: {
      _key: true,
      _cycleKey: Zone.current[_cycleKey] ?? _RevalidationCycle(),
    },
  );
}

class _RevalidationCycle {
  final requests = <(CacheStore, String), Future<Object?>>{};
}

class _SnapshotReadCapture {
  bool usedCache = false;
}
