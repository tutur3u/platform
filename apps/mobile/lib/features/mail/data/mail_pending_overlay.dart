import 'package:mobile/core/cache/pending_mutation_record.dart';

Map<String, dynamic> overlayPendingMail({
  required String workspaceId,
  required String mailboxId,
  required String path,
  required Map<String, dynamic> source,
  required List<PendingMutationRecord> pending,
}) {
  final uri = Uri.parse(path);
  final folder = uri.queryParameters['folder'];
  final kind = uri.pathSegments.last;
  if (uri.queryParameters['page'] != '1' ||
      (uri.queryParameters['query'] ?? '').isNotEmpty ||
      uri.queryParameters['label'] != null ||
      uri.queryParameters['folderId'] != null) {
    return source;
  }
  if (kind != 'messages' && kind != 'threads') return source;
  final rows = (source[kind] as List<dynamic>? ?? [])
      .whereType<Map<String, dynamic>>()
      .map(Map<String, dynamic>.from)
      .toList();
  final byId = {for (final row in rows) row['id'] as String: row};
  final mailboxPath = '/mailboxes/${Uri.encodeComponent(mailboxId)}/';
  for (final mutation in pending) {
    if (mutation.feature != 'mail' ||
        mutation.workspaceId != workspaceId ||
        !mutation.path.contains(mailboxPath)) {
      continue;
    }
    final id = mutation.entityId;
    final payload = mutation.payload ?? {};
    if (kind == 'messages' &&
        folder == 'drafts' &&
        mutation.path.endsWith('/drafts') &&
        mutation.method == 'POST' &&
        id != null) {
      byId[id] = _pendingMessage(id, mailboxId, mutation, payload, 'draft');
    } else if (kind == 'messages' &&
        folder == 'drafts' &&
        mutation.path.contains('/drafts/') &&
        mutation.method == 'PATCH' &&
        id != null &&
        byId.containsKey(id)) {
      byId[id] = {...byId[id]!, ...payload};
    } else if (kind == 'messages' &&
        folder == 'drafts' &&
        mutation.path.contains('/drafts/') &&
        mutation.method == 'DELETE') {
      byId.remove(id);
    } else if (kind == 'messages' &&
        mutation.path.endsWith('/messages') &&
        mutation.method == 'POST' &&
        id != null) {
      if (folder == 'drafts') byId.remove(id);
      if (folder == 'sent') {
        byId[id] = _pendingMessage(id, mailboxId, mutation, payload, 'queued');
      }
    } else if (kind == 'threads' && id != null && byId.containsKey(id)) {
      final action = payload['action'];
      if ((action == 'archive' && folder == 'inbox') ||
          (action == 'trash' && folder != 'trash')) {
        byId.remove(id);
      } else if (action == 'star' || action == 'unstar') {
        byId[id] = {...byId[id]!, 'starred': action == 'star'};
      } else if (action == 'mark_read' || action == 'mark_unread') {
        byId[id] = {...byId[id]!, 'unreadCount': action == 'mark_read' ? 0 : 1};
      }
    }
  }
  return {...source, kind: byId.values.toList()};
}

Map<String, dynamic> _pendingMessage(
  String id,
  String mailboxId,
  PendingMutationRecord mutation,
  Map<String, dynamic> payload,
  String status,
) => {
  'id': id,
  'mailboxId': mailboxId,
  'subject': payload['subject'] ?? '',
  'bodyText': payload['bodyText'],
  'snippet': payload['bodyText'] ?? '',
  'createdAt': mutation.createdAt.toIso8601String(),
  'status': status,
  'direction': 'outbound',
  'fromAddress': '',
  'fromName': '',
  'hasAttachments': false,
  'labels': <Object>[],
  'starred': false,
  'unread': false,
};
