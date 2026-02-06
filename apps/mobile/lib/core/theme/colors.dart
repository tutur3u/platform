import 'package:flutter/material.dart';

/// App color constants matching the Tuturuuu design system.
abstract final class AppColors {
  // Brand
  static const primary = Color(0xFF6366F1); // indigo-500
  static const primaryDark = Color(0xFF818CF8); // indigo-400

  // Surfaces
  static const backgroundLight = Color(0xFFFFFFFF);
  static const backgroundDark = Color(0xFF09090B); // zinc-950
  static const surfaceLight = Color(0xFFF4F4F5); // zinc-100
  static const surfaceDark = Color(0xFF18181B); // zinc-900

  // Borders
  static const borderLight = Color(0xFFE4E4E7); // zinc-200
  static const borderDark = Color(0xFF27272A); // zinc-800

  // Text
  static const textPrimaryLight = Color(0xFF09090B); // zinc-950
  static const textPrimaryDark = Color(0xFFFAFAFA); // zinc-50
  static const textSecondaryLight = Color(0xFF71717A); // zinc-500
  static const textSecondaryDark = Color(0xFFA1A1AA); // zinc-400
}
