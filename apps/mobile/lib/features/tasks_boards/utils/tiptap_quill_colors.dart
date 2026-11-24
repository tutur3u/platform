/// TipTap colour marks (highlight and textStyle) in Quill, and back.
///
/// The web editor stores swatch colours as theme variables such as
/// `var(--calendar-bg-red)` and `var(--red)`, which only resolve against a
/// theme. Quill paints a colour attribute through `stringToColor`, which
/// throws on anything but hex, `rgba()`, a colour name or a key in
/// `DefaultStyles.palette`. So each coloured run gets:
///
/// - display values Quill can paint: a theme key (`var(--red)`) that the
///   read-only viewer resolves through [taskDescriptionThemePalette], or,
///   in editors without that palette, the light theme's hex with a text
///   colour readable on it;
/// - the run's original TipTap colour marks, verbatim, in
///   [tipTapColorMarksAttribute], so saving writes them back unchanged
///   unless the user recolours the text.
library;

import 'dart:convert';
import 'dart:ui' show Color;

import 'package:mobile/core/theme/dynamic_colors.dart';

/// The Quill attribute that carries a run's original TipTap colour marks.
/// Quill keeps unknown attributes without painting them.
const String tipTapColorMarksAttribute = 'tiptap-color-marks';

/// The highlight colour TipTap's default highlight uses when it stores
/// none.
const String tipTapDefaultHighlightColor = '#fff59d';

/// Hues the web editor's colour swatches and calendar tints use. Each has
/// a text colour (`var(--red)`) and a background tint
/// (`var(--calendar-bg-red)`).
const List<String> taskDescriptionThemeHues = [
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
  'blue',
  'green',
  'gray',
  'indigo',
  'cyan',
];

final RegExp _themeVariable = RegExp(
  r'^var\(\s*--(calendar-bg-)?([a-z]+)\s*\)$',
  caseSensitive: false,
);

/// The canonical theme key (`var(--red)`, `var(--calendar-bg-red)`) for a
/// stored theme colour the app can paint, or null.
String? taskDescriptionThemeColorKey(Object? value) {
  if (value is! String) return null;
  final match = _themeVariable.firstMatch(value.trim());
  if (match == null) return null;
  final hue = match.group(2)!.toLowerCase();
  if (!taskDescriptionThemeHues.contains(hue)) return null;
  return match.group(1) == null ? 'var(--$hue)' : 'var(--calendar-bg-$hue)';
}

/// Every theme key resolved in [colors], for `DefaultStyles.palette`.
Map<String, Color> taskDescriptionThemePalette(DynamicColors colors) => {
  for (final hue in taskDescriptionThemeHues) ...{
    'var(--$hue)': _hueColor(colors, hue, background: false),
    'var(--calendar-bg-$hue)': _hueColor(colors, hue, background: true),
  },
};

Color _hueColor(DynamicColors c, String hue, {required bool background}) =>
    switch ((hue, background)) {
      ('yellow', false) => c.yellow,
      ('yellow', true) => c.calendarYellow,
      ('orange', false) => c.orange,
      ('orange', true) => c.calendarOrange,
      ('red', false) => c.red,
      ('red', true) => c.calendarRed,
      ('pink', false) => c.pink,
      ('pink', true) => c.calendarPink,
      ('purple', false) => c.purple,
      ('purple', true) => c.calendarPurple,
      ('blue', false) => c.blue,
      ('blue', true) => c.calendarBlue,
      ('green', false) => c.green,
      ('green', true) => c.calendarGreen,
      ('indigo', false) => c.indigo,
      ('indigo', true) => c.calendarIndigo,
      ('cyan', false) => c.cyan,
      ('cyan', true) => c.calendarCyan,
      (_, false) => c.gray,
      (_, true) => c.calendarGray,
    };

/// A stored colour as a Quill display value, or null when nothing can
/// paint it. [themeKeys] keeps theme colours as palette keys (the viewer);
/// otherwise they resolve to the light theme's hex.
String? quillDisplayColor(Object? value, {required bool themeKeys}) {
  final key = taskDescriptionThemeColorKey(value);
  if (key == null) return quillColorOrNull(value);
  if (themeKeys) return key;
  return _hex(taskDescriptionThemePalette(DynamicColors.light)[key]!);
}

/// Near-black or near-white, whichever reads on the hex [background].
String readableTextColorOn(String background) {
  final color = _colorFromHex(background);
  if (color == null) return '#18181b';
  return color.computeLuminance() > 0.4 ? '#18181b' : '#fafafa';
}

/// Whether [value] is a theme key the viewer's palette resolves per theme.
bool isTaskDescriptionThemeKey(Object? value) =>
    value is String && value.startsWith('var(');

/// Quill colour attributes for a run's TipTap colour [marks] (highlight
/// and textStyle, in order), with the marks carried verbatim.
Map<String, dynamic> quillColorAttrsFromTipTapMarks(
  List<Map<Object?, Object?>> marks, {
  required bool themeKeys,
}) {
  if (marks.isEmpty) return const {};
  String? background;
  String? color;
  for (final mark in marks) {
    final attrs = switch (mark['attrs']) {
      final Map<Object?, Object?> attrs => attrs,
      _ => const <Object?, Object?>{},
    };
    if (mark['type'] == 'highlight') {
      background =
          quillDisplayColor(attrs['color'], themeKeys: themeKeys) ??
          tipTapDefaultHighlightColor;
      color =
          quillDisplayColor(attrs['textColor'], themeKeys: themeKeys) ?? color;
    } else {
      color = quillDisplayColor(attrs['color'], themeKeys: themeKeys) ?? color;
      background =
          quillDisplayColor(attrs['backgroundColor'], themeKeys: themeKeys) ??
          background;
    }
  }
  // A fixed background, such as the default highlight or an editor's
  // light tint, pins a text colour that reads on it in either theme.
  if (background != null &&
      color == null &&
      !isTaskDescriptionThemeKey(background)) {
    color = readableTextColorOn(background);
  }
  return {
    'background': ?background,
    'color': ?color,
    tipTapColorMarksAttribute: jsonEncode({
      'marks': marks,
      'background': background,
      'color': color,
    }),
  };
}

/// TipTap colour marks for a Quill run's [attrs].
///
/// A run whose display colours are the ones its carried marks produced
/// writes those marks back verbatim. A recoloured run writes a highlight
/// (or a text colour alone), keeping the original value of whichever
/// channel the user left alone.
List<Map<String, dynamic>> tipTapColorMarksFromQuillAttrs(
  Map<String, dynamic> attrs,
) {
  final background = _nonEmpty(attrs['background']);
  final color = _nonEmpty(attrs['color']);
  final carried = _CarriedColorMarks.decode(attrs[tipTapColorMarksAttribute]);

  if (carried == null) {
    return [
      if (background != null)
        {
          'type': 'highlight',
          'attrs': {'color': background},
        },
      if (quillColorOrNull(color) case final color?)
        {
          'type': 'textStyle',
          'attrs': {'color': color},
        },
    ];
  }

  final backgroundKept = background == carried.background;
  final colorKept = color == carried.color;
  if (backgroundKept && colorKept) return carried.marks;

  final hasBackground = backgroundKept
      ? carried.background != null
      : background != null;
  final backgroundValue = backgroundKept
      ? carried.rawBackground
      : quillColorOrNull(background);
  final colorValue = colorKept ? carried.rawColor : quillColorOrNull(color);
  if (hasBackground) {
    return [
      {
        'type': 'highlight',
        'attrs': {'color': ?backgroundValue, 'textColor': ?colorValue},
      },
    ];
  }
  return [
    if (colorValue != null)
      {
        'type': 'textStyle',
        'attrs': {'color': colorValue},
      },
  ];
}

/// The colour marks a run carried, the display values they produced, and
/// the original value behind each channel.
class _CarriedColorMarks {
  const _CarriedColorMarks({
    required this.marks,
    required this.background,
    required this.color,
    required this.rawBackground,
    required this.rawColor,
  });

  static _CarriedColorMarks? decode(Object? value) {
    if (value is! String) return null;
    final Object? decoded;
    try {
      decoded = jsonDecode(value);
    } on FormatException {
      return null;
    }
    if (decoded is! Map || decoded['marks'] is! List) return null;
    final marks = [
      for (final mark in decoded['marks'] as List)
        if (mark is Map) Map<String, dynamic>.from(mark),
    ];
    String? rawBackground;
    String? rawColor;
    for (final mark in marks) {
      final attrs = switch (mark['attrs']) {
        final Map<Object?, Object?> attrs => attrs,
        _ => const <Object?, Object?>{},
      };
      if (mark['type'] == 'highlight') {
        rawBackground = _nonEmpty(attrs['color']);
        rawColor = _nonEmpty(attrs['textColor']) ?? rawColor;
      } else {
        rawColor = _nonEmpty(attrs['color']) ?? rawColor;
        rawBackground = _nonEmpty(attrs['backgroundColor']) ?? rawBackground;
      }
    }
    return _CarriedColorMarks(
      marks: marks,
      background: _nonEmpty(decoded['background']),
      color: _nonEmpty(decoded['color']),
      rawBackground: rawBackground,
      rawColor: rawColor,
    );
  }

  final List<Map<String, dynamic>> marks;
  final String? background;
  final String? color;
  final String? rawBackground;
  final String? rawColor;
}

String? _nonEmpty(Object? value) =>
    value is String && value.trim().isNotEmpty ? value : null;

final RegExp _hexColor = RegExp(
  r'^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$',
  caseSensitive: false,
);
final RegExp _rgbColor = RegExp(
  r'^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$',
  caseSensitive: false,
);

/// Alpha below which a colour reads as no colour on either theme.
const double _minimumAlpha = 0.2;

/// [value] as a `#rrggbb` colour Quill can paint, or null. Accepts hex
/// and `rgb()`/`rgba()`; mostly transparent colours, theme variables and
/// colour names are dropped.
String? quillColorOrNull(Object? value) {
  if (value is! String) return null;
  final color = value.trim();
  if (color.isEmpty) return null;
  if (_hexColor.hasMatch(color)) return _opaqueHex(color);

  final rgb = _rgbColor.firstMatch(color);
  if (rgb == null) return null;
  final alpha = double.tryParse(rgb.group(4) ?? '');
  if (alpha != null && alpha < _minimumAlpha) return null;
  final channels = [
    for (var i = 1; i <= 3; i++) int.parse(rgb.group(i)!).clamp(0, 255),
  ];
  return '#${channels.map((c) => c.toRadixString(16).padLeft(2, '0')).join()}';
}

/// `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` as `#rrggbb`, or null when
/// its alpha is below [_minimumAlpha].
String? _opaqueHex(String color) {
  var digits = color.substring(1).toLowerCase();
  if (digits.length <= 4) {
    digits = digits.split('').map((d) => '$d$d').join();
  }
  if (digits.length == 8) {
    final alpha = int.parse(digits.substring(6), radix: 16) / 255;
    if (alpha < _minimumAlpha) return null;
  }
  return '#${digits.substring(0, 6)}';
}

Color? _colorFromHex(String value) {
  final hex = quillColorOrNull(value);
  if (hex == null) return null;
  return Color(0xFF000000 | int.parse(hex.substring(1), radix: 16));
}

String _hex(Color color) =>
    '#${(color.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';
