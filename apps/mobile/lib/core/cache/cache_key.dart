import 'dart:collection';
import 'dart:convert';

import 'package:crypto/crypto.dart';

class CacheKey {
  const CacheKey({
    required this.namespace,
    this.userId,
    this.workspaceId,
    this.locale,
    this.schemaVersion = 1,
    this.params = const <String, String>{},
  });

  final String namespace;
  final String? userId;
  final String? workspaceId;
  final String? locale;
  final int schemaVersion;
  final Map<String, String> params;

  Map<String, dynamic> toJson() => {
    'namespace': namespace,
    'userId': userId,
    'workspaceId': workspaceId,
    'locale': locale,
    'schemaVersion': schemaVersion,
    'params': SplayTreeMap<String, String>.from(params),
  };

  String get value {
    final sorted = SplayTreeMap<String, String>.from(params);
    final buffer = StringBuffer()
      ..write(namespace)
      ..write('|u=')
      ..write(userId ?? '')
      ..write('|w=')
      ..write(workspaceId ?? '')
      ..write('|l=')
      ..write(locale ?? '')
      ..write('|v=')
      ..write(schemaVersion);

    if (sorted.isNotEmpty) {
      buffer
        ..write('|p=')
        ..writeAll(
          sorted.entries.map((entry) => '${entry.key}:${entry.value}'),
          ',',
        );
    }

    final value = buffer.toString();
    // Hive rejects string keys longer than 255 characters. Hash the complete
    // identity so long URLs/searches still retain user and workspace isolation.
    // Keep existing short keys stable for already persisted cache entries.
    return value.length <= 255
        ? value
        : 'sha256:${sha256.convert(utf8.encode(value))}';
  }
}
