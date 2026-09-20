import 'dart:typed_data';

import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_cache.dart';

/// Uses the same authenticated, workspace-scoped contract as apps/mail.
class MailRepository {
  MailRepository({ApiClient? apiClient, MailCache? cache})
    : _api = apiClient ?? ApiClient(),
      _cache = cache ?? MailCache();
  final ApiClient _api;
  final MailCache _cache;

  Future<Map<String, dynamic>?> savedView(String wsId) =>
      _cache.snapshot(wsId, 'view-state');
  Future<void> saveView(String wsId, Map<String, dynamic> view) =>
      _cache.saveSnapshot(wsId, 'view-state', view);
  Future<void> denyAccess(String wsId) => _cache.denyAccess(wsId);

  Map<String, dynamic>? cachedList(String wsId, String path) =>
      _cache.peek(wsId, path);

  static String workspacePath(String wsId) =>
      '/api/v1/workspaces/${Uri.encodeComponent(wsId)}/mail';
  static String mailboxPath(String wsId, String mailboxId) =>
      '${workspacePath(wsId)}/mailboxes/${Uri.encodeComponent(mailboxId)}';

  Future<Map<String, dynamic>> bootstrap(String wsId) =>
      _api.getJson('${workspacePath(wsId)}/bootstrap');

  Future<Map<String, dynamic>> list(
    String wsId,
    String mailboxId, {
    required String folder,
    String query = '',
    int page = 1,
    String? label,
    String? folderId,
    bool forceRefresh = false,
  }) {
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
    return _cache.read(
      wsId,
      path,
      () => _api.getJson(path),
      forceRefresh: forceRefresh,
    );
  }

  Future<Map<String, dynamic>> detail(
    String wsId,
    String mailboxId,
    String id, {
    required bool thread,
  }) {
    final path =
        '${mailboxPath(wsId, mailboxId)}/${thread ? 'threads' : 'messages'}/${Uri.encodeComponent(id)}';
    // Editable drafts always use the network.
    if (!thread) return _api.getJson(path);
    return _cache.read(wsId, path, () => _api.getJson(path));
  }

  Future<void> changeState(
    String wsId,
    String mailboxId,
    String id,
    String action, {
    required bool thread,
  }) async {
    final path =
        '${mailboxPath(wsId, mailboxId)}/${thread ? 'threads' : 'messages'}/${Uri.encodeComponent(id)}';
    await _cache.mutate(
      wsId,
      () => _api.patchJson(thread ? path : '$path/state', {'action': action}),
    );
  }

  Future<Map<String, dynamic>> saveDraft(
    String wsId,
    String mailboxId,
    Map<String, dynamic> payload, {
    String? draftId,
  }) => draftId == null
      ? _cache.mutate(
          wsId,
          () =>
              _api.postJson('${mailboxPath(wsId, mailboxId)}/drafts', payload),
        )
      : _cache.mutate(
          wsId,
          () => _api.patchJson(
            '${mailboxPath(wsId, mailboxId)}/drafts/${Uri.encodeComponent(draftId)}',
            payload,
          ),
        );

  Future<void> deleteDraft(
    String wsId,
    String mailboxId,
    String draftId,
  ) async {
    await _cache.mutate(
      wsId,
      () => _api.deleteJson(
        '${mailboxPath(wsId, mailboxId)}/drafts/${Uri.encodeComponent(draftId)}',
      ),
    );
  }

  Future<Map<String, dynamic>> send(
    String wsId,
    String mailboxId,
    Map<String, dynamic> payload,
  ) => _cache.mutate(
    wsId,
    () => _api.postJson('${mailboxPath(wsId, mailboxId)}/messages', payload),
  );

  Future<Map<String, dynamic>> uploadAttachment(
    String wsId,
    String mailboxId,
    String draftId,
    Uint8List bytes,
    String filename,
  ) => _api.sendMultipart(
    'POST',
    '${mailboxPath(wsId, mailboxId)}/drafts/${Uri.encodeComponent(draftId)}/attachments',
    files: [
      ApiMultipartFile.bytes(field: 'file', bytes: bytes, filename: filename),
    ],
  );

  Future<void> removeAttachment(
    String wsId,
    String mailboxId,
    String draftId,
    String attachmentId,
  ) async {
    await _cache.mutate(
      wsId,
      () => _api.deleteJson(
        '${mailboxPath(wsId, mailboxId)}/drafts/${Uri.encodeComponent(draftId)}/attachments/${Uri.encodeComponent(attachmentId)}',
      ),
    );
  }

  Future<Map<String, dynamic>> settings(String wsId, String mailboxId) =>
      _api.getJson('${mailboxPath(wsId, mailboxId)}/settings');

  Future<void> updateSettings(
    String wsId,
    String mailboxId,
    Map<String, dynamic> payload,
  ) async {
    await _cache.mutate(
      wsId,
      () => _api.patchJson('${mailboxPath(wsId, mailboxId)}/settings', payload),
    );
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

  void dispose() => _api.dispose();

  Future<void> bulk(
    String wsId,
    String mailboxId,
    List<String> ids,
    String action, {
    required bool threads,
    String? labelId,
    String? folderId,
  }) async {
    for (var start = 0; start < ids.length; start += 100) {
      final end = start + 100 < ids.length ? start + 100 : ids.length;
      final body = <String, dynamic>{
        'action': action,
        threads ? 'threadIds' : 'messageIds': ids.sublist(start, end),
        if (labelId != null) 'labelId': labelId,
        if (folderId != null) 'folderId': folderId,
      };
      final path =
          '${mailboxPath(wsId, mailboxId)}/${threads ? 'threads' : 'messages'}/bulk';
      if (threads) {
        await _cache.mutate(wsId, () => _api.postJson(path, body));
      } else {
        await _cache.mutate(wsId, () => _api.patchJson(path, body));
      }
    }
  }

  Future<void> markFolderRead(
    String wsId,
    String mailboxId,
    String folder,
  ) async {
    String? cursor;
    String? before;
    do {
      final result = await _api
          .postJson('${mailboxPath(wsId, mailboxId)}/read-all', {
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
    await _cache.mutate(
      wsId,
      () => _api.deleteJson(
        '${mailboxPath(wsId, mailboxId)}/$kind/${Uri.encodeComponent(id)}',
      ),
    );
  }

  Future<Map<String, dynamic>> members(String wsId, String mailboxId) =>
      _api.getJson('${mailboxPath(wsId, mailboxId)}/members');
  Future<void> saveMember(
    String wsId,
    String mailboxId,
    String email,
    String role,
  ) async {
    await _cache.mutate(
      wsId,
      () => _api.postJson('${mailboxPath(wsId, mailboxId)}/members', {
        'email': email,
        'role': role,
      }),
    );
  }

  Future<void> removeMember(
    String wsId,
    String mailboxId,
    String userId,
  ) async {
    await _cache.mutate(
      wsId,
      () => _api.deleteJson(
        '${mailboxPath(wsId, mailboxId)}/members/${Uri.encodeComponent(userId)}',
      ),
    );
  }

  Future<Uint8List> attachment(
    String wsId,
    String mailboxId,
    String messageId,
    String attachmentId,
  ) => _api.getBytes(
    '${mailboxPath(wsId, mailboxId)}/messages/${Uri.encodeComponent(messageId)}/attachments/${Uri.encodeComponent(attachmentId)}',
  );

  Future<Map<String, dynamic>> copyAttachments(
    String wsId,
    String mailboxId,
    String draftId,
    String sourceMessageId,
    List<String> ids,
  ) => _cache.mutate(
    wsId,
    () => _api.postJson(
      '${mailboxPath(wsId, mailboxId)}/drafts/${Uri.encodeComponent(draftId)}/attachments',
      {'sourceMessageId': sourceMessageId, 'attachmentIds': ids},
    ),
  );

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
