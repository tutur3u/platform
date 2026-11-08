import 'dart:convert';

import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_download_manifest.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/feature_flags/mobile_flag.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Notes list responses include bodies; retain at most 200 across both tabs.
class NotesOfflinePreparation {
  NotesOfflinePreparation({required this.api, this.store, this.currentUser});
  final ApiClient api;
  final CacheStore? store;
  final String? Function()? currentUser;
  static const maxItems = 200;
  static const int maxBytes = 1024 * 1024;

  static CacheKey key(
    String? user,
    String workspace, {
    required bool archived,
  }) => CacheKey(
    namespace: archived ? 'notes.archive' : 'notes.list',
    userId: user,
    workspaceId: workspace,
  );

  static void register(
    OfflinePreparerRegistry registry,
    Future<void> Function(String) prepare,
  ) {
    registry.unregister('notes');
    if (registry.isEnabled(MobileFlag.mobileOffline) &&
        registry.isEnabled(MobileFlag.offlineReadNotes)) {
      registry.register('notes', MobileFlag.offlineReadNotes, prepare);
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
    final pages = <List<dynamic>>[];
    var bytes = 0;
    var items = 0;
    for (final archived in [false, true]) {
      manifest.checkScope();
      api.checkUser(user);
      final rows = await ApiClient.runForUser(
        user,
        () => api.getJsonList(
          '/api/v1/workspaces/$workspaceId/notes?archived=$archived',
        ),
      );
      manifest.checkScope();
      api.checkUser(user);
      items += rows.length;
      bytes += utf8.encode(jsonEncode(rows)).length;
      if (items > maxItems || bytes > maxBytes) {
        throw const OfflinePreparationUnavailable();
      }
      pages.add(rows);
    }
    for (var i = 0; i < pages.length; i++) {
      await manifest.save(key(user, workspaceId, archived: i == 1), pages[i]);
    }
    await manifest.reconcile(
      workspaceId: workspaceId,
      namespaces: {'notes.list', 'notes.archive'},
    );
    manifest.retain('notes', workspaceId);
  }
}
