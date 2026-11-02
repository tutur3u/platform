import 'dart:convert';

import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_download_manifest.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/feature_flags/mobile_flag.dart';
import 'package:mobile/data/repositories/document_repository.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Metadata for the default Documents page; no detail or file downloads.
class DocumentsOfflinePreparation {
  DocumentsOfflinePreparation({
    required this.api,
    this.store,
    this.currentUser,
  });
  final ApiClient api;
  final CacheStore? store;
  final String? Function()? currentUser;
  static const maxItems = 200;
  static const int maxBytes = 1024 * 1024;
  static String path(String workspaceId) => DocumentsEndpoints.documents(
    workspaceId,
    limit: DocumentRepository.screenPageSize,
    offset: 0,
  );

  static void register(
    OfflinePreparerRegistry registry,
    Future<void> Function(String) prepare,
  ) {
    registry.unregister('documents');
    if (registry.isEnabled(MobileFlag.mobileOffline) &&
        registry.isEnabled(MobileFlag.offlineReadDocuments)) {
      registry.register('documents', MobileFlag.offlineReadDocuments, prepare);
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
    )..checkScope();
    api.checkUser(user);
    final requestPath = path(workspaceId);
    final response = await ApiClient.runForUser(
      user,
      () => api.getJson(requestPath),
    );
    manifest.checkScope();
    api.checkUser(user);
    final rows = response['data'];
    if (rows is! List) throw const FormatException('Invalid documents list');
    if (rows.length > maxItems ||
        utf8.encode(jsonEncode(response)).length > maxBytes) {
      throw const OfflinePreparationUnavailable();
    }
    final metadata = {
      ...response,
      'data': [
        for (final row in rows)
          {
            for (final field in ['id', 'name', 'is_public', 'created_at'])
              field: (row as Map)[field],
          },
      ],
    };
    await manifest.save(
      CacheKey(
        namespace: 'documents.list',
        userId: user,
        workspaceId: workspaceId,
        params: {'path': requestPath},
      ),
      metadata,
    );
    await manifest.reconcile(
      workspaceId: workspaceId,
      namespaces: {'documents.list'},
    );
    manifest.retain('documents', workspaceId);
  }
}
