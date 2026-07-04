final RegExp _uuidPattern = RegExp(
  '^[0-9a-fA-F]{8}-'
  '[0-9a-fA-F]{4}-'
  '[0-9a-fA-F]{4}-'
  '[0-9a-fA-F]{4}-'
  r'[0-9a-fA-F]{12}$',
);

String? normalizeUuid(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  return _uuidPattern.hasMatch(trimmed) ? trimmed : null;
}

bool isUuid(String value) => normalizeUuid(value) != null;
