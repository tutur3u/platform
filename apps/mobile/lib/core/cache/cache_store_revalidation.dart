part of 'cache_store.dart';

abstract final class _CacheRevalidationScope {
  static final Object _key = Object();
  static final Object _snapshotKey = Object();

  static void recordSnapshot() {
    final capture = Zone.current[_snapshotKey];
    if (capture is _SnapshotReadCapture) capture.usedCache = true;
  }

  static Future<T> read<T>(
    Future<T> Function() operation,
    void Function(T) onSnapshot,
  ) async {
    final capture = _SnapshotReadCapture();
    final value = await runZoned(
      operation,
      zoneValues: {_snapshotKey: capture},
    );
    if (!capture.usedCache) return value;
    onSnapshot(value);
    return await run(operation);
  }

  static bool get active => Zone.current[_key] == true;

  static Future<T> run<T>(Future<T> Function() operation) =>
      runZoned(operation, zoneValues: {_key: true});
}

class _SnapshotReadCapture {
  bool usedCache = false;
}
