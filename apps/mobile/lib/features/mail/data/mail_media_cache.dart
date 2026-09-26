import 'dart:convert';
import 'dart:typed_data';

import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';

/// Encrypted, account-scoped cache for small inline images in a mail thread.
/// The namespace follows the thread so Archive and Trash can clear every image
/// immediately without enumerating or retaining individual attachment IDs.
class MailMediaCache {
  MailMediaCache({CacheStore? store, String? Function()? currentUserId})
    : _store = store ?? CacheStore.instance,
      _currentUserId = currentUserId ?? currentCacheUserId,
      _userId = (currentUserId ?? currentCacheUserId)();

  static const int maxImageBytes = 4 * 1024 * 1024;
  static const _policy = CachePolicy(
    staleAfter: Duration(days: 1),
    expireAfter: Duration(days: 3),
    allowBackgroundRefresh: false,
  );

  final CacheStore _store;
  final String? Function() _currentUserId;
  final String? _userId;

  bool get _usable => _userId != null && _userId == _currentUserId();

  String _namespace(String mailboxId, String threadId) =>
      'mail.media.$mailboxId.$threadId';

  CacheKey _key(
    String wsId,
    String mailboxId,
    String threadId,
    String messageId,
    String attachmentId,
  ) => CacheKey(
    namespace: _namespace(mailboxId, threadId),
    userId: _userId,
    workspaceId: wsId,
    params: {'message': messageId, 'attachment': attachmentId},
  );

  Future<Uint8List?> read(
    String wsId,
    String mailboxId,
    String threadId,
    String messageId,
    String attachmentId,
  ) async {
    if (!_usable) return null;
    try {
      final result = await _store.read<String>(
        key: _key(wsId, mailboxId, threadId, messageId, attachmentId),
        decode: (json) => json! as String,
      );
      if (!_usable || result.isExpired || !result.hasValue) return null;
      final bytes = base64Decode(result.data!);
      return bytes.length <= maxImageBytes ? bytes : null;
    } on Object {
      return null;
    }
  }

  Future<void> save(
    String wsId,
    String mailboxId,
    String threadId,
    String messageId,
    String attachmentId,
    Uint8List bytes,
  ) async {
    if (!_usable || bytes.isEmpty || bytes.length > maxImageBytes) return;
    try {
      await _store.write(
        key: _key(wsId, mailboxId, threadId, messageId, attachmentId),
        policy: _policy,
        payload: base64Encode(bytes),
        tags: const ['mail.media'],
      );
    } on Object {
      // Image display must not depend on local cache availability.
    }
  }

  Future<void> clearThread(
    String wsId,
    String mailboxId,
    String threadId,
  ) async {
    if (!_usable) return;
    try {
      await _store.clearScope(
        userId: _userId,
        workspaceId: wsId,
        namespace: _namespace(mailboxId, threadId),
      );
    } on Object {
      // The server action succeeded even if local cleanup was unavailable.
    }
  }
}
