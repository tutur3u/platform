import 'dart:convert';

import 'package:crypto/crypto.dart';

/// Payload-free cache invalidation identity.
///
/// A notifier may retain its last event after logout or workspace clearing.
/// Never retain the removed resource's private JSON, tags or query parameters.
class CacheResourceRemoval {
  const CacheResourceRemoval({
    required this.key,
    required this.namespace,
    this.userId,
    this.workspaceId,
  });

  /// Event-only opaque identity; persisted cache keys remain unchanged.
  static String identityForKey(String key) =>
      'sha256:${sha256.convert(utf8.encode(key))}';

  final String key;
  final String namespace;
  final String? userId;
  final String? workspaceId;
}
