import 'package:flutter/material.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';

Color resolveTimeTrackingCategoryColor(
  BuildContext context,
  String? rawColor, {
  required Color fallback,
}) {
  if (rawColor == null || rawColor.trim().isEmpty) {
    return fallback;
  }

  final value = rawColor.trim();
  final hexColor = _tryParseHexColor(value);
  if (hexColor != null) {
    return hexColor;
  }

  final token = value
      .toUpperCase()
      .replaceAll(RegExp('[^A-Z]'), '')
      .replaceFirst('DYNAMIC', '');

  final colors = DynamicColors.of(context);
  return switch (token) {
    'RED' => colors.red,
    'BLUE' => colors.blue,
    'GREEN' => colors.green,
    'YELLOW' => colors.yellow,
    'ORANGE' => colors.orange,
    'PURPLE' => colors.purple,
    'PINK' => colors.pink,
    'INDIGO' => colors.indigo,
    'CYAN' => colors.cyan,
    'GRAY' || 'GREY' => colors.gray,
    'LIME' => colors.lime,
    'TEAL' => colors.teal,
    'ROSE' => colors.rose,
    'SKY' => colors.sky,
    _ => fallback,
  };
}

Color? _tryParseHexColor(String value) {
  final cleaned = value.replaceAll('#', '').toUpperCase();
  try {
    if (cleaned.length == 6) {
      return Color(int.parse('FF$cleaned', radix: 16));
    }
    if (cleaned.length == 8) {
      return Color(int.parse(cleaned, radix: 16));
    }
  } on FormatException {
    return null;
  }
  return null;
}
