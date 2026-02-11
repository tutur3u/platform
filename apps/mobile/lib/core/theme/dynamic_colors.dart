import 'package:flutter/material.dart';

/// Dynamic color tokens matching the web app's design system.
///
/// These colors are designed to work in both light and dark themes,
/// with automatic adaptation based on the current brightness.
///
/// Usage:
/// ```dart
/// final colors = DynamicColors.of(context);
/// final badgeColor = colors.dynamicYellow;
/// ```
class DynamicColors {
  const DynamicColors({
    required this.brightness,
    required this.lime,
    required this.purple,
    required this.pink,
    required this.blue,
    required this.sky,
    required this.green,
    required this.yellow,
    required this.orange,
    required this.red,
    required this.indigo,
    required this.cyan,
    required this.teal,
    required this.rose,
    required this.gray,
    required this.lightLime,
    required this.lightPurple,
    required this.lightPink,
    required this.lightBlue,
    required this.lightSky,
    required this.lightGreen,
    required this.lightYellow,
    required this.lightOrange,
    required this.lightRed,
    required this.lightIndigo,
    required this.lightCyan,
    required this.lightTeal,
    required this.lightRose,
    required this.lightGray,
    required this.calendarBlue,
    required this.calendarRed,
    required this.calendarGreen,
    required this.calendarYellow,
    required this.calendarPurple,
    required this.calendarPink,
    required this.calendarOrange,
    required this.calendarIndigo,
    required this.calendarCyan,
    required this.calendarGray,
  });

  /// Get the appropriate dynamic colors for the given brightness
  factory DynamicColors.forBrightness(Brightness brightness) {
    return brightness == Brightness.dark ? dark : light;
  }

  /// Get dynamic colors from the current BuildContext
  factory DynamicColors.of(BuildContext context) {
    final brightness = Theme.of(context).brightness;
    return DynamicColors.forBrightness(brightness);
  }

  final Brightness brightness;

  // Core dynamic colors
  final Color lime;
  final Color purple;
  final Color pink;
  final Color blue;
  final Color sky;
  final Color green;
  final Color yellow;
  final Color orange;
  final Color red;
  final Color indigo;
  final Color cyan;
  final Color teal;
  final Color rose;
  final Color gray;

  // Light variants (for text/borders)
  final Color lightLime;
  final Color lightPurple;
  final Color lightPink;
  final Color lightBlue;
  final Color lightSky;
  final Color lightGreen;
  final Color lightYellow;
  final Color lightOrange;
  final Color lightRed;
  final Color lightIndigo;
  final Color lightCyan;
  final Color lightTeal;
  final Color lightRose;
  final Color lightGray;

  // Calendar background colors
  final Color calendarBlue;
  final Color calendarRed;
  final Color calendarGreen;
  final Color calendarYellow;
  final Color calendarPurple;
  final Color calendarPink;
  final Color calendarOrange;
  final Color calendarIndigo;
  final Color calendarCyan;
  final Color calendarGray;

  /// Get dynamic colors for light theme
  static const DynamicColors light = DynamicColors(
    brightness: Brightness.light,
    // Core colors - darker, more saturated for visibility on light bg
    lime: Color(0xFF5C9C1C), // hsl(90 75% 35%)
    purple: Color(0xFF6B21A8), // hsl(270 75% 40%)
    pink: Color(0xFFBE185D), // hsl(330 75% 45%)
    blue: Color(0xFF1D4ED8), // hsl(220 80% 45%)
    sky: Color(0xFF0EA5E9), // hsl(200 75% 40%)
    green: Color(0xFF15803D), // hsl(140 75% 35%)
    yellow: Color(0xFFB45309), // hsl(30 75% 35%)
    orange: Color(0xFFEA580C), // hsl(25 85% 45%)
    red: Color(0xFFDC2626), // hsl(0 80% 45%)
    indigo: Color(0xFF3730A3), // hsl(250 75% 45%)
    cyan: Color(0xFF0D9488), // hsl(180 75% 35%)
    teal: Color(0xFF0F766E), // hsl(170 75% 35%)
    rose: Color(0xFFE11D48), // hsl(345 75% 45%)
    gray: Color(0xFF737373), // hsl(0 0% 45%)
    // Light variants
    lightLime: Color(0xFF7CB342), // hsl(90 70% 45%)
    lightPurple: Color(0xFF8E24AA), // hsl(270 70% 50%)
    lightPink: Color(0xFFD81B60), // hsl(330 70% 55%)
    lightBlue: Color(0xFF2E7AD8), // hsl(220 75% 55%)
    lightSky: Color(0xFF29B6F6), // hsl(200 70% 50%)
    lightGreen: Color(0xFF4CAF50), // hsl(140 70% 45%)
    lightYellow: Color(0xFFF59E0B), // hsl(30 75% 45%)
    lightOrange: Color(0xFFFF9800), // hsl(25 80% 55%)
    lightRed: Color(0xFFEF4444), // hsl(0 75% 55%)
    lightIndigo: Color(0xFF5C6BC0), // hsl(250 70% 55%)
    lightCyan: Color(0xFF26A69A), // hsl(180 70% 45%)
    lightTeal: Color(0xFF009688), // hsl(170 70% 45%)
    lightRose: Color(0xFFEC407A), // hsl(345 70% 55%)
    lightGray: Color(0xFF808080), // hsl(0 0% 50%)
    // Calendar backgrounds
    calendarBlue: Color(0xFFE8F0FE), // hsl(220 64% 95%)
    calendarRed: Color(0xFFFCE8E8), // hsl(0 64% 95%)
    calendarGreen: Color(0xFFE8F5E9), // hsl(140 64% 95%)
    calendarYellow: Color(0xFFFEF9E7), // hsl(50 75% 95%)
    calendarPurple: Color(0xFFF3E5F5), // hsl(270 64% 95%)
    calendarPink: Color(0xFFFCE4EC), // hsl(330 64% 95%)
    calendarOrange: Color(0xFFFEF3E7), // hsl(25 64% 95%)
    calendarIndigo: Color(0xFFE8EAF6), // hsl(250 64% 95%)
    calendarCyan: Color(0xFFE0F7FA), // hsl(180 64% 95%)
    calendarGray: Color(0xFFF5F5F5), // hsl(0 0% 95%)
  );

  /// Get dynamic colors for dark theme
  static const DynamicColors dark = DynamicColors(
    brightness: Brightness.dark,
    // Core colors - neon-like colors with high saturation for dark bg
    lime: Color(0xFFB8F570), // hsl(90 100% 75%)
    purple: Color(0xFFC084FC), // hsl(270 95% 80%)
    pink: Color(0xFFF9A8D4), // hsl(330 100% 80%)
    blue: Color(0xFF93C5FD), // hsl(220 100% 75%)
    sky: Color(0xFF7DD3FC), // hsl(200 95% 80%)
    green: Color(0xFF86EFAC), // hsl(140 100% 70%)
    yellow: Color(0xFFFEF08A), // hsl(50 100% 80%)
    orange: Color(0xFFFDBA74), // hsl(25 100% 75%)
    red: Color(0xFFFCA5A5), // hsl(0 100% 75%)
    indigo: Color(0xFFA5B4FC), // hsl(250 95% 80%)
    cyan: Color(0xFF67E8F9), // hsl(180 100% 75%)
    teal: Color(0xFF5EEAD4), // hsl(170 100% 75%)
    rose: Color(0xFFFDA4AF), // hsl(345 100% 80%)
    gray: Color(0xFFB3B3B3), // hsl(0 0% 70%)
    // Light variants - brighter for dark theme
    lightLime: Color(0xFFB8F570), // hsl(90 65% 75%)
    lightPurple: Color(0xFFD8B4FE), // hsl(270 70% 80%)
    lightPink: Color(0xFFFBCFE8), // hsl(330 75% 80%)
    lightBlue: Color(0xFFBFDBFE), // hsl(220 75% 80%)
    lightSky: Color(0xFFBAE6FD), // hsl(200 70% 80%)
    lightGreen: Color(0xFF86EFAC), // hsl(140 65% 75%)
    lightYellow: Color(0xFFFEF9C3), // hsl(50 90% 80%)
    lightOrange: Color(0xFFFED7AA), // hsl(25 80% 80%)
    lightRed: Color(0xFFFECACA), // hsl(0 75% 80%)
    lightIndigo: Color(0xFFC7D2FE), // hsl(250 70% 80%)
    lightCyan: Color(0xFF99F6E4), // hsl(180 65% 75%)
    lightTeal: Color(0xFF80CBC4), // hsl(170 65% 75%)
    lightRose: Color(0xFFFECDD3), // hsl(345 75% 80%)
    lightGray: Color(0xFFCCCCCC), // hsl(0 0% 80%)
    // Calendar backgrounds - darker for dark theme
    calendarBlue: Color(0xFF0F172A), // hsl(220 14% 11%)
    calendarRed: Color(0xFF1A0A0A), // hsl(0 14% 11%)
    calendarGreen: Color(0xFF0A1A0F), // hsl(140 14% 11%)
    calendarYellow: Color(0xFF1A180A), // hsl(40 14% 11%)
    calendarPurple: Color(0xFF120A1A), // hsl(270 14% 11%)
    calendarPink: Color(0xFF1A0A14), // hsl(330 14% 11%)
    calendarOrange: Color(0xFF1A110A), // hsl(25 14% 11%)
    calendarIndigo: Color(0xFF0F0A1A), // hsl(250 14% 11%)
    calendarCyan: Color(0xFF0A1A1A), // hsl(180 14% 11%)
    calendarGray: Color(0xFF1A1A1A), // hsl(0 0% 11%)
  );
}

/// Extension on BuildContext to easily access dynamic colors
extension DynamicColorsExtension on BuildContext {
  /// Get dynamic colors for the current theme
  DynamicColors get dynamicColors => DynamicColors.of(this);
}

/// Status badge color definitions matching web app patterns
///
/// Each status has:
/// - backgroundColor: The fill color (usually with opacity)
/// - borderColor: The border color (usually with opacity)
/// - textColor: The text color
class StatusBadgeColors {
  const StatusBadgeColors({
    required this.backgroundColor,
    required this.borderColor,
    required this.textColor,
  });

  /// Warning/Pending status - uses yellow/orange tones
  factory StatusBadgeColors.warning(BuildContext context) {
    final colors = DynamicColors.of(context);
    return StatusBadgeColors(
      backgroundColor: colors.yellow.withValues(alpha: 0.1),
      borderColor: colors.yellow.withValues(alpha: 0.3),
      textColor: colors.yellow,
    );
  }

  /// Success/Approved status - uses green tones
  factory StatusBadgeColors.success(BuildContext context) {
    final colors = DynamicColors.of(context);
    return StatusBadgeColors(
      backgroundColor: colors.green.withValues(alpha: 0.1),
      borderColor: colors.green.withValues(alpha: 0.3),
      textColor: colors.green,
    );
  }

  /// Error/Rejected status - uses red tones
  factory StatusBadgeColors.error(BuildContext context) {
    final colors = DynamicColors.of(context);
    return StatusBadgeColors(
      backgroundColor: colors.red.withValues(alpha: 0.1),
      borderColor: colors.red.withValues(alpha: 0.3),
      textColor: colors.red,
    );
  }

  /// Info/Needs Info status - uses blue/sky tones
  factory StatusBadgeColors.info(BuildContext context) {
    final colors = DynamicColors.of(context);
    return StatusBadgeColors(
      backgroundColor: colors.blue.withValues(alpha: 0.1),
      borderColor: colors.blue.withValues(alpha: 0.3),
      textColor: colors.blue,
    );
  }

  /// Critical status - uses red with stronger emphasis
  factory StatusBadgeColors.critical(BuildContext context) {
    final colors = DynamicColors.of(context);
    return StatusBadgeColors(
      backgroundColor: colors.red.withValues(alpha: 0.2),
      borderColor: colors.red.withValues(alpha: 0.5),
      textColor: colors.red,
    );
  }

  /// High priority - uses orange tones
  factory StatusBadgeColors.high(BuildContext context) {
    final colors = DynamicColors.of(context);
    return StatusBadgeColors(
      backgroundColor: colors.orange.withValues(alpha: 0.1),
      borderColor: colors.orange.withValues(alpha: 0.3),
      textColor: colors.orange,
    );
  }

  /// Normal/Medium priority - uses yellow tones
  factory StatusBadgeColors.normal(BuildContext context) {
    final colors = DynamicColors.of(context);
    return StatusBadgeColors(
      backgroundColor: colors.yellow.withValues(alpha: 0.1),
      borderColor: colors.yellow.withValues(alpha: 0.3),
      textColor: colors.yellow,
    );
  }

  /// Low priority - uses blue tones
  factory StatusBadgeColors.low(BuildContext context) {
    final colors = DynamicColors.of(context);
    return StatusBadgeColors(
      backgroundColor: colors.blue.withValues(alpha: 0.1),
      borderColor: colors.blue.withValues(alpha: 0.3),
      textColor: colors.blue,
    );
  }

  final Color backgroundColor;
  final Color borderColor;
  final Color textColor;
}

/// Helper extension for creating badge decorations
extension StatusBadgeDecoration on StatusBadgeColors {
  /// Create a BoxDecoration for the badge
  BoxDecoration decoration({double borderRadius = 999}) {
    return BoxDecoration(
      color: backgroundColor,
      border: Border.all(color: borderColor),
      borderRadius: BorderRadius.circular(borderRadius),
    );
  }
}
