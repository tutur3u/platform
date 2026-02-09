import 'package:flutter/material.dart';

/// Maps event color strings (from Supabase) to Flutter colors.
abstract final class EventColors {
  static const _colorMap = <String, Color>{
    'RED': Colors.red,
    'PINK': Colors.pink,
    'PURPLE': Colors.purple,
    'DEEP_PURPLE': Colors.deepPurple,
    'INDIGO': Colors.indigo,
    'BLUE': Colors.blue,
    'LIGHT_BLUE': Colors.lightBlue,
    'CYAN': Colors.cyan,
    'TEAL': Colors.teal,
    'GREEN': Colors.green,
    'LIGHT_GREEN': Colors.lightGreen,
    'LIME': Colors.lime,
    'YELLOW': Colors.yellow,
    'AMBER': Colors.amber,
    'ORANGE': Colors.orange,
    'DEEP_ORANGE': Colors.deepOrange,
    'BROWN': Colors.brown,
    'GREY': Colors.grey,
    'BLUE_GREY': Colors.blueGrey,
  };

  static const Color _defaultColor = Colors.blue;

  /// Returns the solid color for the given event color string.
  static Color fromString(String? color) {
    if (color == null) return _defaultColor;
    return _colorMap[color.toUpperCase()] ?? _defaultColor;
  }

  /// Returns a bright variant of the color for event title text.
  ///
  /// Lightens the base color by blending with white so it pops on both
  /// light and dark backgrounds — especially visible on dark themes.
  static Color bright(String? color) {
    final base = fromString(color);
    return Color.lerp(base, Colors.white, 0.35)!;
  }

  /// Returns a low-opacity variant for card backgrounds.
  static Color background(String? color) =>
      fromString(color).withValues(alpha: 0.25);

  /// All available color names for the color picker.
  static List<String> get allColors => _colorMap.keys.toList();
}
