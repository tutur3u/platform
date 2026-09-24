String? readWorkspaceContextId(dynamic value) {
  if (value is Map<String, dynamic>) {
    for (final key in const [
      'workspaceContextId',
      'workspace_context_id',
      'wsId',
      'workspaceId',
    ]) {
      final candidate = value[key];
      if (candidate is String && candidate.isNotEmpty) {
        return candidate;
      }
    }
  }
  return null;
}

bool readImmersiveFlag(dynamic value) {
  if (value is Map<String, dynamic>) {
    for (final key in const [
      'immersiveMode',
      'immersive',
      'enabled',
      'value',
    ]) {
      final candidate = value[key];
      if (candidate is bool) {
        return candidate;
      }
    }
  }
  return false;
}
