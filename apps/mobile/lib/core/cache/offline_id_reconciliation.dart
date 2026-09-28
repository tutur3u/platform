/// Rewrites exact local IDs in queued paths and structured payloads after a
/// create returns its server ID. Free text and partial matches remain intact.
({String path, Map<String, dynamic>? payload}) reconcileOfflineIds(
  String path,
  Map<String, dynamic>? payload,
  Map<String, String> ids,
) {
  if (ids.isEmpty) return (path: path, payload: payload);
  final uri = Uri.parse(path);
  final resolved = uri.replace(
    pathSegments: [
      if (uri.path.startsWith('/')) '',
      ...uri.pathSegments.map((part) => ids[part] ?? part),
    ],
    queryParameters: uri.queryParameters.isEmpty
        ? null
        : uri.queryParameters.map(
            (key, value) => MapEntry(key, ids[value] ?? value),
          ),
  );
  Object? rewrite(Object? value) {
    if (value is String) return ids[value] ?? value;
    if (value is List) return value.map(rewrite).toList(growable: false);
    if (value is Map) {
      return value.map((key, item) => MapEntry(key.toString(), rewrite(item)));
    }
    return value;
  }

  return (
    path: resolved.toString(),
    payload: payload == null
        ? null
        : Map<String, dynamic>.from(rewrite(payload)! as Map),
  );
}

String? createdServerId(Map<String, dynamic> response) {
  if (response['id'] case final String id when id.isNotEmpty) return id;
  for (final key in [
    'data',
    'collection',
    'entry',
    'tracker',
    'meeting',
    'document',
    'user',
    'feedback',
    'course',
    'board',
    'list',
    'task',
    'label',
    'project',
    'initiative',
    'quiz',
    'quizSet',
    'flashcard',
  ]) {
    final value = response[key];
    if (value is Map) {
      final id = value['id'];
      if (id is String && id.isNotEmpty) return id;
    }
  }
  return null;
}
