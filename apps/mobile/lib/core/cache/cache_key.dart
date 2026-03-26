import 'dart:collection';

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

    return buffer.toString();
  }
}
