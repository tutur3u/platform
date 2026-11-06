import 'package:mobile/core/feature_flags/mobile_flag.dart';

typedef OfflinePreparationTask = Future<void> Function(String workspaceId);

/// Each app owns one registration; null flags preserve existing downloads.
class OfflinePreparerRegistry {
  OfflinePreparerRegistry({required this.isEnabled});

  final bool Function(MobileFlag) isEnabled;
  final _entries =
      <String, ({MobileFlag? flag, OfflinePreparationTask task})>{};

  Iterable<String> get appKeys => _entries.keys;

  void register(
    String appKey,
    MobileFlag? flagKey,
    OfflinePreparationTask preparer,
  ) {
    _entries[appKey] = (flag: flagKey, task: preparer);
  }

  void unregister(String appKey) => _entries.remove(appKey);

  bool containsKey(String appKey) => _entries.containsKey(appKey);

  OfflinePreparationTask? operator [](String appKey) {
    final entry = _entries[appKey];
    if (entry == null) return null;
    final flag = entry.flag;
    if (flag != null &&
        (!isEnabled(MobileFlag.mobileOffline) || !isEnabled(flag))) {
      return null;
    }
    return entry.task;
  }
}
