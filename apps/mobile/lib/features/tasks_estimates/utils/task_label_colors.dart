import 'package:flutter/material.dart';

const String kDefaultTaskLabelColor = '#3B82F6';
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

String taskLabelColorOrDefault(String? raw) {
  final normalized = normalizeTaskLabelColor(raw);
  if (normalized != null) {
    return normalized;
  }
  return kDefaultTaskLabelColor;
}
