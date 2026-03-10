import 'dart:math';

const List<String> taskLabelColorPresets = <String>[
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#22C55E',
  '#06B6D4',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#6B7280',
  '#000000',
];

final Set<String> _taskLabelColorPresetSet = taskLabelColorPresets.toSet();

String? normalizeTaskLabelColor(String? raw) {
  if (raw == null || raw.trim().isEmpty) {
    return null;
  }

  final value = raw.trim().replaceFirst('#', '');
  if (value.length != 6 && value.length != 8) {
    return null;
  }

  final parsed = int.tryParse(value, radix: 16);
  if (parsed == null) {
    return null;
  }

  final rgb = value.length == 8 ? value.substring(2) : value;
  return '#${rgb.toUpperCase()}';
}

bool isTaskLabelColorPreset(String? raw) {
  final normalized = normalizeTaskLabelColor(raw);
  if (normalized == null) {
    return false;
  }
  return _taskLabelColorPresetSet.contains(normalized);
}

String taskLabelColorOrDefault(String? raw) {
  final normalized = normalizeTaskLabelColor(raw);
  if (normalized != null && _taskLabelColorPresetSet.contains(normalized)) {
    return normalized;
  }
  return taskLabelColorPresets[5];
}

String randomTaskLabelColorPreset({Random? random}) {
  final rng = random ?? Random();
  return taskLabelColorPresets[rng.nextInt(taskLabelColorPresets.length)];
}
