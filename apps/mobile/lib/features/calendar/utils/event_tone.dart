import 'package:flutter/material.dart';
import 'package:mobile/data/models/calendar_event.dart';

/// Provider colour identity mapped to the nine semantic calendar tones.
String eventTone(CalendarEvent event) {
  final value = (event.color ?? event.sourceColor ?? 'BLUE').toUpperCase();
  if (value.startsWith('#') && value.length == 7) {
    final rgb = int.tryParse(value.substring(1), radix: 16);
    if (rgb != null) {
      final hsv = HSVColor.fromColor(Color(0xFF000000 | rgb));
      if (hsv.saturation < .12) return 'gray';
      final h = hsv.hue;
      if (h < 15 || h >= 345) return 'red';
      if (h < 45) return 'orange';
      if (h < 70) return 'yellow';
      if (h < 165) return 'green';
      if (h < 195) return 'teal';
      if (h < 255) return 'blue';
      if (h < 290) return 'purple';
      return 'pink';
    }
  }
  return switch (value) {
    'RED' => 'red',
    'PINK' => 'pink',
    'PURPLE' || 'DEEP_PURPLE' || 'INDIGO' => 'purple',
    'TEAL' => 'teal',
    'GREEN' || 'LIGHT_GREEN' || 'LIME' => 'green',
    'YELLOW' || 'AMBER' => 'yellow',
    'ORANGE' || 'DEEP_ORANGE' || 'BROWN' => 'orange',
    'GRAY' || 'GREY' || 'BLUE_GREY' => 'gray',
    _ => 'blue',
  };
}
