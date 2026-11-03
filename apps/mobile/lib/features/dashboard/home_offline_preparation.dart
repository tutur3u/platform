import 'dart:convert';

import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_download_manifest.dart';
import 'package:mobile/core/cache/offline_preparer_registry.dart';
import 'package:mobile/core/feature_flags/mobile_flags.dart';
import 'package:mobile/data/sources/api_client.dart';

void registerHomeOffline(
  OfflinePreparerRegistry registry,
  MobileFlagsState flags,
  OfflinePreparationTask prepare,
) {
  registry.unregister('home');
  if (flags.enabled(MobileFlag.offlineReadHome)) {
    registry.register('home', MobileFlag.offlineReadHome, prepare);
  }
}

Future<void> retainHomeOffline(
  String wsId, {
  required Future<List<CacheKey>> Function() warm,
  CacheStore? store,
  String? Function()? owner,
}) async {
  final current = owner ?? currentCacheUserId;
  final user = current();
  if (user == null) throw StateError('Sign in to download Home.');
  final cache = store ?? CacheStore.instance;
  final manifest = OfflineDownloadManifest(cache, user, current);
  final keys = await CacheStore.awaitRevalidation(
    () => ApiClient.runForUser(user, warm),
  );
  var bytes = 0;
  for (final key in keys) {
    manifest.checkScope();
    if (key.userId != user || key.workspaceId != wsId) {
      throw StateError('Home download scope changed.');
    }
    final saved = await cache.read<Object?>(key: key, decode: (json) => json);
    bytes += utf8.encode(jsonEncode(saved.data)).length;
    if (!saved.hasValue || bytes > 4 * 1024 * 1024 || keys.length > 3) {
      throw StateError('Home snapshot is missing or exceeds its limit.');
    }
    await manifest.save(key, saved.data);
  }
  if (keys.length < 2) throw StateError('Home snapshot is incomplete.');
  await manifest.verify();
  manifest.retain('home', wsId);
}
