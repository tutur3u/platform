import 'dart:math';

import 'package:flutter/material.dart';

String colorToHexString(Color color) {
  final r = (color.r * 255).round().toRadixString(16).padLeft(2, '0');
  final g = (color.g * 255).round().toRadixString(16).padLeft(2, '0');
  final b = (color.b * 255).round().toRadixString(16).padLeft(2, '0');
  return '#$r$g$b'.toUpperCase();
}

String randomHexColor({Random? random}) {
  final rng = random ?? Random();
  final hue = rng.nextInt(360).toDouble();
  final saturation = (55 + rng.nextInt(36)).toDouble() / 100;
  final lightness = (42 + rng.nextInt(24)).toDouble() / 100;
  final color = HSLColor.fromAHSL(1, hue, saturation, lightness).toColor();
  return colorToHexString(color);
}

String? normalizeHex(String raw) {
  if (raw.trim().isEmpty) {
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

  if (value.length == 8) {
    return '#${value.substring(2)}'.toUpperCase();
  }

  return '#${value.toUpperCase()}';
}

Color? parseHex(String? hex) {
  if (hex == null || hex.trim().isEmpty) {
    return null;
  }

  final normalized = normalizeHex(hex);
  if (normalized == null) {
    return null;
  }

  final value = int.tryParse('FF${normalized.substring(1)}', radix: 16);
  return value == null ? null : Color(value);
}
