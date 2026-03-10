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
