import 'dart:convert';

import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_download_manifest.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/feature_flags/mobile_flag.dart';
import 'package:mobile/data/sources/api_client.dart';

class DriveOfflinePreparation {
  DriveOfflinePreparation({required this.api, this.store, this.currentUser});
  final ApiClient api;
  final CacheStore? store;
  final String? Function()? currentUser;
  static const maxItems = 200;
  static const int maxBytes = 1024 * 1024;

  static void register(
    OfflinePreparerRegistry registry,
    Future<void> Function(String) prepare,
  ) {
    registry.unregister('drive');
    if (registry.isEnabled(MobileFlag.mobileOffline) &&
        registry.isEnabled(MobileFlag.offlineReadDriveList)) {
      registry.register('drive', MobileFlag.offlineReadDriveList, prepare);
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
    final path = DriveEndpoints.list(
      workspaceId,
      path: '',
      search: '',
      limit: 100,
      offset: 0,
      sortBy: 'name',
      sortOrder: 'asc',
    );
    manifest.checkScope();
    api.checkUser(user);
    final data = await ApiClient.runForUser(user, () => api.getJson(path));
    manifest.checkScope();
    api.checkUser(user);
    final rows = data['data'];
    final total = (data['pagination'] as Map?)?['total'];
    if (rows is! List ||
        rows.length > maxItems ||
        (total is num && total > maxItems) ||
        utf8.encode(jsonEncode(data)).length > maxBytes) {
      throw const OfflinePreparationUnavailable();
    }
    await manifest.save(
      CacheKey(
        namespace: 'drive.directory',
        userId: user,
        workspaceId: workspaceId,
        params: {'path': path},
      ),
      data,
    );
    // The root page is not authoritative for other directories or queries.
    await manifest.verify();
    manifest.retain('drive', workspaceId);
  }
}
