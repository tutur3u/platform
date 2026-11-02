import 'dart:convert';

import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_download_manifest.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/feature_flags/mobile_flag.dart';
import 'package:mobile/data/sources/api_client.dart';

class HabitsOfflinePreparation {
  HabitsOfflinePreparation({required this.api, this.store, this.currentUser});
  final ApiClient api;
  final CacheStore? store;
  final String? Function()? currentUser;
  static const maxItems = 200;
  static const int maxBytes = 1024 * 1024;

  static void register(
    OfflinePreparerRegistry registry,
    Future<void> Function(String) prepare,
  ) {
    registry.unregister('habits');
    if (registry.isEnabled(MobileFlag.mobileOffline) &&
        registry.isEnabled(MobileFlag.offlineReadHabits)) {
      registry.register('habits', MobileFlag.offlineReadHabits, prepare);
    }
  }

  Future<void> prepare(String workspaceId) async {
    final owner = currentUser ?? currentCacheUserId;
    final user = owner();
    if (user == null) throw const OfflinePreparationUnavailable();
    final manifest = OfflineDownloadManifest(
      store ?? CacheStore.instance,
      user,
      owner,
    );
    final pending =
        <({String namespace, String path, Map<String, dynamic> data})>[];
    var bytes = 0;
    Future<Map<String, dynamic>> read(String namespace, String path) async {
      manifest.checkScope();
      api.checkUser(user);
      final data = await ApiClient.runForUser(user, () => api.getJson(path));
      manifest.checkScope();
      api.checkUser(user);
      bytes += utf8.encode(jsonEncode(data)).length;
      void checkLists(Object? value) {
        if (value is List) {
          if (value.length > maxItems) {
            throw const OfflinePreparationUnavailable();
          }
          value.forEach(checkLists);
        } else if (value is Map) {
          value.values.forEach(checkLists);
        }
      }

      if (bytes > maxBytes) throw const OfflinePreparationUnavailable();
      checkLists(data);
      pending.add((namespace: namespace, path: path, data: data));
      return data;
    }

    final base = '/api/v1/workspaces/$workspaceId/habit-trackers';
    final data = await read('habits.trackers', '$base?scope=self');
    final trackers = data['trackers'];
    if (trackers is! List) throw const FormatException('Invalid trackers');
    for (final card in trackers) {
      final tracker = (card as Map)['tracker'] as Map;
      final id = tracker['id'] as String;
      await read(
        'habits.detail',
        '$base/${Uri.encodeComponent(id)}?scope=self',
      );
    }
    // Publish only after every response passes the aggregate budget.
    for (final entry in pending) {
      await manifest.save(
        CacheKey(
          namespace: entry.namespace,
          userId: user,
          workspaceId: workspaceId,
          params: {'path': entry.path},
        ),
        entry.data,
      );
    }
    await manifest.reconcile(
      workspaceId: workspaceId,
      namespaces: {'habits.trackers', 'habits.detail'},
    );
    manifest.retain('habits', workspaceId);
  }
}
