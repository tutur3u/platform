import 'package:flutter/material.dart';
import 'package:mobile/data/models/calendar_event.dart';

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
    'GRAY': Colors.grey,
    'GREY': Colors.grey,
    'BLUE_GREY': Colors.blueGrey,
  };

  static const Color _defaultColor = Colors.blue;

  /// Returns the solid color for the given event color string.
  static Color fromString(String? color) {
    if (color == null) return _defaultColor;
    return _colorMap[color.toUpperCase()] ?? _defaultColor;
  }

  /// Opaque provider RGB, using current source RGB only for inherited intent.
  static Color forEvent(CalendarEvent event) {
    final metadata = event.schedulingMetadata?['google_color'];
    if (metadata is Map &&
        metadata['version'] == 1 &&
        metadata['inherited'] is bool) {
      final inherited = metadata['inherited'] == true;
      final resolved =
          (inherited ? _rgb(event.sourceColor) : null) ??
          _rgb(metadata['background']);
      if (resolved != null) return resolved;
    }
    return fromString(event.color);
  }

  static Color? _rgb(Object? value) {
    if (value is! String || !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(value)) {
      return null;
    }
    return Color(0xff000000 | int.parse(value.substring(1), radix: 16));
  }

  /// Higher contrast black/white remains readable in both themes.
  static Color foreground(CalendarEvent event) {
    final luminance = forEvent(event).computeLuminance();
    return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05)
        ? Colors.black
        : Colors.white;
  }

  static Color bright(String? color) {
    final luminance = fromString(color).computeLuminance();
    return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05)
        ? Colors.black
        : Colors.white;
  }

  static Color background(String? color) => fromString(color);

  /// All available color names for the color picker.
  static List<String> get allColors => [
    'RED',
    'BLUE',
    'GREEN',
    'YELLOW',
    'ORANGE',
    'PURPLE',
    'PINK',
    'INDIGO',
    'CYAN',
    'GRAY',
  ];
}
