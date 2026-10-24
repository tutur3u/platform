import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';

/// Workspace config holding the request status-change grace period.
const timerStatusChangeGracePeriodConfigId =
    'TIME_TRACKING_REQUEST_STATUS_CHANGE_GRACE_PERIOD_MINUTES';

/// Must match `TimeTrackerRepository._read`, which reads these paths through
/// `readThroughJson` under this namespace.
const _namespace = 'time_tracker.data';

String timerWorkspaceSettingsPath(String workspaceId) =>
    '/api/v1/workspaces/$workspaceId/settings';

String timerGracePeriodConfigPath(String workspaceId) =>
    '${timerWorkspaceSettingsPath(workspaceId)}/'
    '$timerStatusChangeGracePeriodConfigId';

CacheKey _key(String userId, String workspaceId, String path) => CacheKey(
  namespace: _namespace,
  userId: userId,
  workspaceId: workspaceId,
  params: {'path': path},
);

/// Publishes a saved approval threshold into the cached workspace settings.
///
/// The threshold write may be queued offline and still report success, so
/// readers that reload afterwards would otherwise see the previous value and
/// invite a second save. Live revalidation later replaces these entries with
/// the server's copy.
Future<void> cacheSavedMissedEntryThreshold({
  required String userId,
  required String workspaceId,
  required int? threshold,
  required int statusChangeGracePeriodMinutes,
  CacheStore? cacheStore,
}) async {
  final store = cacheStore ?? CacheStore.instance;
  final tags = ['module:time_tracker', 'workspace:$workspaceId'];
  Future<void> merge(String path, Map<String, dynamic> values) async {
    final key = _key(userId, workspaceId, path);
    final current = await store.read<Map<String, dynamic>>(
      key: key,
      decode: (payload) => payload is Map
          ? Map<String, dynamic>.from(payload)
          : <String, dynamic>{},
    );
    await store.write(
      key: key,
      policy: CachePolicies.moduleData,
      payload: {...?current.data, ...values},
      tags: tags,
    );
  }

  await merge(timerWorkspaceSettingsPath(workspaceId), {
    'missed_entry_date_threshold': threshold,
  });
  await merge(timerGracePeriodConfigPath(workspaceId), {
    'value': '$statusChangeGracePeriodMinutes',
  });
}
