import 'dart:convert';

import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_download_manifest.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/core/feature_flags/mobile_flag.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';

class MailOfflinePreparation {
  MailOfflinePreparation({required this.api, this.store, this.currentUser});
  final ApiClient api;
  final CacheStore? store;
  final String? Function()? currentUser;
  static const maxItems = 200;
  static const int maxBytes = 1024 * 1024;

  static void register(
    OfflinePreparerRegistry registry,
    Future<void> Function(String) prepare,
  ) {
    registry.unregister('mail');
    if (registry.isEnabled(MobileFlag.mobileOffline) &&
        registry.isEnabled(MobileFlag.offlineReadMail)) {
      registry.register('mail', MobileFlag.offlineReadMail, prepare);
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
    final pending = <String, Map<String, dynamic>>{};
    var bytes = 0;
    var items = 0;
    Future<Map<String, dynamic>> read(String path, String rowsKey) async {
      manifest.checkScope();
      api.checkUser(user);
      final data = await ApiClient.runForUser(user, () => api.getJson(path));
      manifest.checkScope();
      api.checkUser(user);
      final rows = data[rowsKey];
      if (rows is! List) throw const FormatException('Invalid Mail list');
      items += rows.length;
      bytes += utf8.encode(jsonEncode(data)).length;
      if (items > maxItems || bytes > maxBytes) {
        throw const OfflinePreparationUnavailable();
      }
      pending[path] = data;
      return data;
    }

    final bootstrap = await read(
      '${MailRepository.workspacePath(workspaceId)}/bootstrap',
      'mailboxes',
    );
    for (final box in bootstrap['mailboxes'] as List) {
      final id = (box as Map)['id'] as String;
      final params = Uri(
        queryParameters: {
          'folder': 'inbox',
          'query': '',
          'page': '1',
          'pageSize': '30',
        },
      ).query;
      await read(
        '${MailRepository.mailboxPath(workspaceId, id)}/threads?$params',
        'threads',
      );
    }
    // This list-only preparation downloads zero message bodies or attachments.
    for (final entry in pending.entries) {
      await manifest.save(
        CacheKey(
          namespace: 'mail.list',
          userId: user,
          workspaceId: workspaceId,
          params: {'path': Uri.encodeComponent(entry.key)},
        ),
        entry.value,
      );
    }
    // Preserve existing settings and opened-thread snapshots in this namespace.
    manifest.retain('mail', workspaceId);
  }
}
