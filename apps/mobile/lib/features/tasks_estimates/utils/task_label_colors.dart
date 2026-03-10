import 'dart:math';
import 'package:flutter/material.dart';

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
final RegExp _taskLabelHexPattern = RegExp(
  r'^#?(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$',
);

String? normalizeTaskLabelColor(String? raw) {
  if (raw == null || raw.trim().isEmpty) {
    return null;
  }

  final trimmed = raw.trim();
  if (!_taskLabelHexPattern.hasMatch(trimmed)) {
    return null;
  }

  final value = trimmed.startsWith('#') ? trimmed.substring(1) : trimmed;
  final rgb = value.length == 8 ? value.substring(2) : value;
  return '#${rgb.toUpperCase()}';
}

Color? parseTaskLabelColor(String? raw) {
  final normalized = normalizeTaskLabelColor(raw);
  if (normalized == null) {
    return null;
  }

  final rgb = normalized.substring(1);
  final value = int.tryParse('FF$rgb', radix: 16);
  if (value == null) {
    return null;
  }

  return Color(value);
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
