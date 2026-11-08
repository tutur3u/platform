import 'dart:convert';

import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_download_manifest.dart';
import 'package:mobile/core/cache/offline_preparer_registry.dart';
import 'package:mobile/core/feature_flags/mobile_flag.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Bounded snapshots matching the first pages opened by ChatRepository.
class ChatOfflinePreparation {
  ChatOfflinePreparation({required this.api, this.store, this.currentUser});
  final ApiClient api;
  final CacheStore? store;
  final String? Function()? currentUser;
  static const conversationLimit = 40;
  static const recentLimit = 10;
  static const messageLimit = 60;
  static const int maxBytes = 2 * 1024 * 1024;

  static void register(
    OfflinePreparerRegistry registry,
    Future<void> Function(String) prepare,
  ) {
    registry.unregister('chat');
    if (registry.isEnabled(MobileFlag.mobileOffline) &&
        registry.isEnabled(MobileFlag.offlineReadChat)) {
      registry.register('chat', MobileFlag.offlineReadChat, prepare);
    }
  }

  Future<void> prepare(String workspaceId) async {
    final owner = currentUser ?? currentCacheUserId;
    final user = owner();
    if (user == null) throw StateError('Sign in before preparing Chat.');
    final manifest = OfflineDownloadManifest(
      store ?? CacheStore.instance,
      user,
      owner,
    );
    var bytes = 0;
    Future<Map<String, dynamic>> read(String path) async {
      manifest.checkScope();
      api.checkUser(user);
      final response = await ApiClient.runForUser(
        user,
        () => api.getJson(path),
      );
      manifest.checkScope();
      api.checkUser(user);
      bytes += utf8.encode(jsonEncode(response)).length;
      if (bytes > maxBytes) throw StateError('Chat offline size cap exceeded.');
      return response;
    }

    Future<void> save(String namespace, String path, Object payload) =>
        manifest.save(
          CacheKey(
            namespace: 'chat.$namespace',
            userId: user,
            workspaceId: workspaceId,
            params: {'path': path},
          ),
          payload,
        );

    final base = '/api/v1/workspaces/$workspaceId/chat/conversations';
    final path = '$base?archived=active&limit=$conversationLimit&offset=0';
    final list = await read(path);
    final rows = list['conversations'];
    if (rows is! List || rows.length > conversationLimit) {
      throw const FormatException('Invalid bounded Chat conversation page');
    }
    await save('conversations', path, list);
    for (final row in rows.take(recentLimit)) {
      if (row is! Map || row['id'] is! String) {
        throw const FormatException('Invalid Chat conversation id');
      }
      final id = Uri.encodeComponent(row['id'] as String);
      final path = '$base/$id/messages?limit=$messageLimit';
      final messages = await read(path);
      final items = messages['messages'];
      if (items is! List || items.length > messageLimit) {
        throw const FormatException('Invalid bounded Chat message page');
      }
      await save('messages', path, messages);
    }
    await manifest.reconcile(
      workspaceId: workspaceId,
      namespaces: {'chat.conversations', 'chat.messages'},
    );
    manifest.retain('chat', workspaceId);
  }
}
