String? normalizeAvatarUrl(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }
  return trimmed;
}

String? avatarIdentityKeyForUrl(String? value) {
  final normalized = normalizeAvatarUrl(value);
  if (normalized == null) {
    return null;
  }

  final uri = Uri.tryParse(normalized);
  if (uri == null) {
    return normalized.split('?').first;
  }

  if (uri.scheme.isNotEmpty && uri.host.isNotEmpty) {
    final path = uri.path.isEmpty ? '/' : uri.path;
    return '${uri.scheme.toLowerCase()}://${uri.host.toLowerCase()}$path';
  }

  return normalized.split('?').first;
}
