import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_cache.dart';
import 'package:mobile/features/mail/data/mail_media_cache.dart';
import 'package:mobile/features/mail/data/mail_pending_overlay.dart';

/// Uses the same authenticated, workspace-scoped contract as apps/mail.
class MailRepository {
  MailRepository({
    ApiClient? apiClient,
    MailCache? cache,
    MailMediaCache? mediaCache,
  }) : _api = apiClient ?? ApiClient(),
       _cache = cache ?? MailCache(),
       _mediaCache = mediaCache ?? MailMediaCache() {
    _cache.accessRevoked.addListener(_onAccessRevoked);
  }
  final ApiClient _api;
  final MailCache _cache;
  final MailMediaCache _mediaCache;
  final Map<String, Future<void>> _mediaRefreshes = {};
  void _onAccessRevoked() {
    final wsId = _cache.accessRevoked.value;
    if (wsId != null) unawaited(_mediaCache.clearWorkspace(wsId));
  }

  ValueListenable<String?>? get accessRevoked => _cache.accessRevoked;

  Future<Map<String, dynamic>?> savedView(String wsId) =>
      _cache.snapshot(wsId, 'view-state');
  Future<void> saveView(String wsId, Map<String, dynamic> view) =>
      _cache.saveSnapshot(wsId, 'view-state', view);
  Future<void> denyAccess(String wsId) async {
    await _cache.denyAccess(wsId);
    await _mediaCache.clearWorkspace(wsId);
  }

  Map<String, dynamic>? cachedList(String wsId, String path) {
    final cached = _cache.peek(wsId, path);
    if (cached == null) return null;
    final segments = Uri.parse(path).pathSegments;
    final mailboxIndex = segments.indexOf('mailboxes');
    if (mailboxIndex < 0 || mailboxIndex + 1 >= segments.length) return cached;
    return overlayPendingMail(
      workspaceId: wsId,
      mailboxId: segments[mailboxIndex + 1],
      path: path,
      source: cached,
      pending: OfflineMutationQueue.instance.pending.value,
    );
  }

  static String workspacePath(String wsId) =>
      '/api/v1/workspaces/${Uri.encodeComponent(wsId)}/mail';
  static String mailboxPath(String wsId, String mailboxId) =>
      '${workspacePath(wsId)}/mailboxes/${Uri.encodeComponent(mailboxId)}';

  Future<Map<String, dynamic>> bootstrap(String wsId) {
    final path = '${workspacePath(wsId)}/bootstrap';
    return _cache.read(wsId, path, () => _api.getJson(path));
  }

  Future<Map<String, dynamic>> list(
    String wsId,
    String mailboxId, {
    required String folder,
    String query = '',
    int page = 1,
    String? label,
    String? folderId,
    bool forceRefresh = false,
  }) async {
    final kind = folder == 'drafts' || folder == 'sent'
        ? 'messages'
        : 'threads';
    final params = Uri(
      queryParameters: {
        'folder': folder,
        'query': query,
        'page': '$page',
        'pageSize': '30',
        if (label != null) 'label': label,
        if (folderId != null) 'folderId': folderId,
      },
    ).query;
    final path = '${mailboxPath(wsId, mailboxId)}/$kind?$params';
    Map<String, dynamic> result;
    try {
      result = await _cache.read(
        wsId,
        path,
        () => _api.getJson(path),
        forceRefresh: forceRefresh,
      );
    } on ApiException catch (error) {
      if (error.statusCode != 0 ||
          !OfflineMutationQueue.instance.pending.value.any(
            (item) => item.feature == 'mail' && item.workspaceId == wsId,
          )) {
        rethrow;
      }
      result = {
        kind: <Object>[],
        'pagination': {'hasMore': false, 'total': 0},
      };
    }
    return overlayPendingMail(
      workspaceId: wsId,
      mailboxId: mailboxId,
      path: path,
      source: result,
      pending: OfflineMutationQueue.instance.pending.value,
    );
  }

  Future<Map<String, dynamic>> detail(
    String wsId,
    String mailboxId,
    String id, {
    required bool thread,
  }) async {
    final path =
        '${mailboxPath(wsId, mailboxId)}/${thread ? 'threads' : 'messages'}/${Uri.encodeComponent(id)}';
    return await _cache.read(wsId, path, () => _api.getJson(path));
  }

  Future<Map<String, dynamic>?> cachedThread(
    String wsId,
    String mailboxId,
    String id,
  ) => _cache.snapshot(
    wsId,
    '${mailboxPath(wsId, mailboxId)}/threads/${Uri.encodeComponent(id)}',
  );

  Future<Map<String, dynamic>> refreshThread(
    String wsId,
    String mailboxId,
    String id,
  ) {
    final path =
        '${mailboxPath(wsId, mailboxId)}/threads/${Uri.encodeComponent(id)}';
    return _cache.read(
      wsId,
      path,
      () => _api.getJson(path),
      forceRefresh: true,
    );
  }

  Future<void> changeState(
    String wsId,
    String mailboxId,
    String id,
    String action, {
    required bool thread,
    DateTime? snoozedUntil,
  }) async {
    final path =
        '${mailboxPath(wsId, mailboxId)}/${thread ? 'threads' : 'messages'}/${Uri.encodeComponent(id)}';
    final payload = <String, dynamic>{
      'action': action,
      if (snoozedUntil != null)
        'snoozedUntil': snoozedUntil.toUtc().toIso8601String(),
    };
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'mail',
      method: 'PATCH',
      path: thread ? path : '$path/state',
      workspaceId: wsId,
      payload: payload,
      entityId: id,
    )) {
      return;
    }
    await _cache.mutate(
      wsId,
      () => _api.patchJson(thread ? path : '$path/state', payload),
    );
    if (thread && (action == 'archive' || action == 'trash')) {
      await _mediaCache.clearThread(wsId, mailboxId, id);
    }
  }

  Future<Map<String, dynamic>> saveDraft(
    String wsId,
    String mailboxId,
    Map<String, dynamic> payload, {
    String? draftId,
  }) async {
    final id = draftId ?? newLocalMutationId();
    final path = draftId == null
        ? '${mailboxPath(wsId, mailboxId)}/drafts'
        : '${mailboxPath(wsId, mailboxId)}/drafts/${Uri.encodeComponent(id)}';
    final queuedPayload = draftId == null
        ? <String, dynamic>{...payload, 'clientMessageId': id}
        : payload;
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'mail',
      method: draftId == null ? 'POST' : 'PATCH',
      path: path,
      workspaceId: wsId,
      payload: queuedPayload,
      entityId: id,
      replaySafe: draftId == null,
    )) {
      final message = {
        'id': id,
        ...payload,
        'status': 'draft',
        'recipients': [
          for (final kind in ['to', 'cc', 'bcc'])
            for (final address in payload[kind] as List<dynamic>? ?? [])
              {'kind': kind, 'address': address},
        ],
        'attachments': <Object>[],
      };
      await _cache.saveSnapshot(
        wsId,
        '${mailboxPath(wsId, mailboxId)}/messages/${Uri.encodeComponent(id)}',
        message,
      );
      return {'message': message};
    }
    final result = await _cache.mutate(
      wsId,
      () => draftId == null
          ? _api.postJson(path, payload)
          : _api.patchJson(path, payload),
    );
    final message = result['message'];
    if (message is Map<String, dynamic> && message['id'] is String) {
      await _cache.saveSnapshot(
        wsId,
        '${mailboxPath(wsId, mailboxId)}/messages/${Uri.encodeComponent(message['id'] as String)}',
        message,
      );
    }
    return result;
  }

  Future<void> deleteDraft(
    String wsId,
    String mailboxId,
    String draftId,
  ) async {
    final path =
        '${mailboxPath(wsId, mailboxId)}/drafts/${Uri.encodeComponent(draftId)}';
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'mail',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: draftId,
    )) {
      return;
    }
    await _cache.mutate(wsId, () => _api.deleteJson(path));
  }

  Future<Map<String, dynamic>> send(
    String wsId,
    String mailboxId,
    Map<String, dynamic> payload,
  ) async {
    final id = payload['draftId'] as String? ?? newLocalMutationId();
    final path = '${mailboxPath(wsId, mailboxId)}/messages';
    final queuedPayload = {
      ...payload,
      if (payload['draftId'] == null) 'clientMessageId': id,
    };
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'mail',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: queuedPayload,
      entityId: id,
      replaySafe: true,
    )) {
      return {
        'message': {'id': id, 'status': 'queued'},
      };
    }
    try {
      return await _cache.mutate(
        wsId,
        () => _api.postJson(path, queuedPayload),
      );
    } on ApiException catch (error) {
      if (await OfflineMutationQueue.instance.enqueueAfterNetworkFailure(
        error: error,
        feature: 'mail',
        method: 'POST',
        path: path,
        workspaceId: wsId,
        payload: queuedPayload,
        entityId: id,
        replaySafe: true,
      )) {
        return {
          'message': {'id': id, 'status': 'queued'},
        };
      }
      rethrow;
    }
  }

  Future<Map<String, dynamic>> uploadAttachment(
    String wsId,
    String mailboxId,
    String draftId,
    Uint8List bytes,
    String filename,
  ) async {
    final path =
        '${mailboxPath(wsId, mailboxId)}/drafts/${Uri.encodeComponent(draftId)}/attachments';
    final id = newLocalMutationId();
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'mail',
      method: 'MULTIPART_POST',
      path: path,
      workspaceId: wsId,
      payload: {
        'clientAttachmentId': id,
        'filename': filename,
        'bytes': base64Encode(bytes),
      },
      entityId: draftId,
    )) {
      return {
        'attachment': {
          'id': id,
          'filename': filename,
          'sizeBytes': bytes.length,
          'contentType': 'application/octet-stream',
          'disposition': 'attachment',
        },
      };
    }
    return await _api.sendMultipart(
      'POST',
      path,
      files: [
        ApiMultipartFile.bytes(field: 'file', bytes: bytes, filename: filename),
      ],
    );
  }

  Future<void> removeAttachment(
    String wsId,
    String mailboxId,
    String draftId,
    String attachmentId,
  ) async {
    final path =
        '${mailboxPath(wsId, mailboxId)}/drafts/${Uri.encodeComponent(draftId)}/attachments/${Uri.encodeComponent(attachmentId)}';
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'mail',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: draftId,
    )) {
      return;
    }
    await _cache.mutate(wsId, () => _api.deleteJson(path));
  }

  Future<Map<String, dynamic>> settings(String wsId, String mailboxId) =>
      _api.getJson('${mailboxPath(wsId, mailboxId)}/settings');

  Future<void> updateSettings(
    String wsId,
    String mailboxId,
    Map<String, dynamic> payload,
  ) async {
    final path = '${mailboxPath(wsId, mailboxId)}/settings';
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'mail',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      payload: payload,
      entityId: mailboxId,
    )) {
      return;
    }
    await _cache.mutate(wsId, () => _api.patchJson(path, payload));
  }

  Future<Map<String, dynamic>> organization(String wsId, String mailboxId) {
    final path = '${mailboxPath(wsId, mailboxId)}/organization';
    return _cache.read(
      wsId,
      path,
      () => _api.getJson(path),
      forceRefresh: true,
    );
  }

  void dispose() {
    _cache.accessRevoked.removeListener(_onAccessRevoked);
    _api.dispose();
  }

  Future<void> bulk(
    String wsId,
    String mailboxId,
    List<String> ids,
    String action, {
    required bool threads,
    DateTime? snoozedUntil,
    String? labelId,
    String? folderId,
  }) async {
    for (var start = 0; start < ids.length; start += 100) {
      final end = start + 100 < ids.length ? start + 100 : ids.length;
      final body = <String, dynamic>{
        'action': action,
        if (snoozedUntil != null)
          'snoozedUntil': snoozedUntil.toUtc().toIso8601String(),
        threads ? 'threadIds' : 'messageIds': ids.sublist(start, end),
        if (labelId != null) 'labelId': labelId,
        if (folderId != null) 'folderId': folderId,
      };
      final path =
          '${mailboxPath(wsId, mailboxId)}/${threads ? 'threads' : 'messages'}/bulk';
      if (await OfflineMutationQueue.instance.enqueueIfOffline(
        feature: 'mail',
        method: threads ? 'POST' : 'PATCH',
        path: path,
        workspaceId: wsId,
        payload: body,
      )) {
        continue;
      }
      if (threads) {
        await _cache.mutate(wsId, () => _api.postJson(path, body));
      } else {
        await _cache.mutate(wsId, () => _api.patchJson(path, body));
      }
      if (threads && (action == 'archive' || action == 'trash')) {
        await Future.wait(
          ids
              .sublist(start, end)
              .map((id) => _mediaCache.clearThread(wsId, mailboxId, id)),
        );
      }
    }
  }

  Future<void> markFolderRead(
    String wsId,
    String mailboxId,
    String folder,
  ) async {
    final path = '${mailboxPath(wsId, mailboxId)}/read-all';
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'mail',
      method: 'MAIL_READ_ALL',
      path: path,
      workspaceId: wsId,
      payload: {'folder': folder},
      entityId: mailboxId,
    )) {
      return;
    }
    String? cursor;
    String? before;
    do {
      final result = await _api.postJson(path, {
        'folder': folder,
        if (cursor != null) 'cursor': cursor,
        if (before != null) 'before': before,
      });
      cursor = result['nextCursor'] as String?;
      before = result['before'] as String;
    } while (cursor != null);
  }

  Future<void> saveOrganization(
    String wsId,
    String mailboxId,
    String kind,
    Map<String, dynamic> payload, {
    String? id,
  }) async {
    final path = '${mailboxPath(wsId, mailboxId)}/$kind';
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'mail',
      method: id == null ? 'POST' : 'PATCH',
      path: id == null ? path : '$path/${Uri.encodeComponent(id)}',
      workspaceId: wsId,
      payload: payload,
      entityId: id,
    )) {
      return;
    }
    if (id == null) {
      await _cache.mutate(wsId, () => _api.postJson(path, payload));
    } else {
      await _cache.mutate(
        wsId,
        () => _api.patchJson('$path/${Uri.encodeComponent(id)}', payload),
      );
    }
  }

  Future<void> deleteOrganization(
    String wsId,
    String mailboxId,
    String kind,
    String id,
  ) async {
    final path =
        '${mailboxPath(wsId, mailboxId)}/$kind/${Uri.encodeComponent(id)}';
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'mail',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: id,
    )) {
      return;
    }
    await _cache.mutate(wsId, () => _api.deleteJson(path));
  }

  Future<Map<String, dynamic>> members(String wsId, String mailboxId) =>
      _api.getJson('${mailboxPath(wsId, mailboxId)}/members');
  Future<void> saveMember(
    String wsId,
    String mailboxId,
    String email,
    String role,
  ) async {
    final path = '${mailboxPath(wsId, mailboxId)}/members';
    final payload = {'email': email, 'role': role};
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'mail',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      entityId: mailboxId,
    )) {
      return;
    }
    await _cache.mutate(wsId, () => _api.postJson(path, payload));
  }

  Future<void> removeMember(
    String wsId,
    String mailboxId,
    String userId,
  ) async {
    final path =
        '${mailboxPath(wsId, mailboxId)}/members/${Uri.encodeComponent(userId)}';
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'mail',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: userId,
    )) {
      return;
    }
    await _cache.mutate(wsId, () => _api.deleteJson(path));
  }

  Future<Uint8List> attachment(
    String wsId,
    String mailboxId,
    String messageId,
    String attachmentId, {
    String? threadId,
    bool cacheInlineImage = false,
  }) async {
    final path =
        '${mailboxPath(wsId, mailboxId)}/messages/${Uri.encodeComponent(messageId)}/attachments/${Uri.encodeComponent(attachmentId)}';
    Future<Uint8List> fetch() => _api.getBytes(path);
    Future<void> refresh() async {
      try {
        final bytes = await fetch();
        if (cacheInlineImage && threadId != null) {
          await _mediaCache.save(
            wsId,
            mailboxId,
            threadId,
            messageId,
            attachmentId,
            bytes,
          );
        }
      } on ApiException catch (error) {
        if (error.statusCode == 401 || error.statusCode == 403) {
          if (threadId != null) {
            await _mediaCache.clearThread(wsId, mailboxId, threadId);
          }
          await _cache.denyAccess(wsId);
        }
      } on Object {
        // Keep the last inline image visible during a transient failure.
      }
    }

    if (cacheInlineImage && threadId != null) {
      final cached = await _mediaCache.read(
        wsId,
        mailboxId,
        threadId,
        messageId,
        attachmentId,
      );
      if (cached != null) {
        final flight = _mediaRefreshes.putIfAbsent(path, () async {
          try {
            await refresh();
          } finally {
            unawaited(_mediaRefreshes.remove(path));
          }
        });
        unawaited(flight);
        return cached;
      }
    }
    late final Uint8List bytes;
    try {
      bytes = await fetch();
    } on ApiException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        await _cache.denyAccess(wsId);
      }
      rethrow;
    }
    if (cacheInlineImage && threadId != null) {
      await _mediaCache.save(
        wsId,
        mailboxId,
        threadId,
        messageId,
        attachmentId,
        bytes,
      );
    }
    return bytes;
  }

  Future<Map<String, dynamic>> copyAttachments(
    String wsId,
    String mailboxId,
    String draftId,
    String sourceMessageId,
    List<String> ids,
  ) async {
    final path =
        '${mailboxPath(wsId, mailboxId)}/drafts/${Uri.encodeComponent(draftId)}/attachments';
    final payload = {'sourceMessageId': sourceMessageId, 'attachmentIds': ids};
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'mail',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      entityId: draftId,
    )) {
      return {'attachments': <Object>[]};
    }
    return await _cache.mutate(wsId, () => _api.postJson(path, payload));
  }

  Future<Map<String, dynamic>> aiDraft(
    String wsId,
    String mailboxId,
    Map<String, dynamic> payload,
  ) => _cache.mutate(
    wsId,
    () => _api.postJson('${mailboxPath(wsId, mailboxId)}/ai/draft', payload),
  );
}

List<Map<String, dynamic>> mailRows(Object? value) =>
    (value as List<dynamic>? ?? []).whereType<Map<String, dynamic>>().toList();
