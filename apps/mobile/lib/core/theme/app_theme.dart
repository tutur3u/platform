import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/theme/colors.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Material 3 theme data for light and dark modes.
abstract final class AppTheme {
  static Brightness resolveBrightness(
    shad.ThemeMode themeMode,
    Brightness systemBrightness,
  ) {
    switch (themeMode) {
      case shad.ThemeMode.light:
        return Brightness.light;
      case shad.ThemeMode.dark:
        return Brightness.dark;
      case shad.ThemeMode.system:
        return systemBrightness;
    }
  }

  static SystemUiOverlayStyle systemUiOverlayStyleFor(
    Brightness brightness,
  ) {
    final isDark = brightness == Brightness.dark;

    return SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
      statusBarBrightness: isDark ? Brightness.dark : Brightness.light,
      systemNavigationBarColor: Colors.transparent,
      systemNavigationBarIconBrightness: isDark
          ? Brightness.light
          : Brightness.dark,
      systemNavigationBarDividerColor: Colors.transparent,
    );
  }

  static ColorScheme get _lightScheme =>
      ColorScheme.fromSeed(
        seedColor: AppColors.primary,
        surface: AppColors.backgroundLight,
      ).copyWith(
        surface: AppColors.backgroundLight,
        surfaceContainerLowest: AppColors.surfaceLight,
        surfaceContainerLow: const Color(0xFFF9F6F0),
        surfaceContainer: const Color(0xFFF4EFE7),
        surfaceContainerHigh: const Color(0xFFEDE7DD),
        surfaceContainerHighest: const Color(0xFFE5DED2),
      );

  static ColorScheme get _darkScheme =>
      ColorScheme.fromSeed(
        seedColor: AppColors.primaryDark,
        brightness: Brightness.dark,
        surface: AppColors.backgroundDark,
      ).copyWith(
        surface: AppColors.backgroundDark,
        surfaceContainerLowest: AppColors.surfaceDark,
        surfaceContainerLow: const Color(0xFF1C1E22),
        surfaceContainer: const Color(0xFF23262B),
        surfaceContainerHigh: const Color(0xFF2A2D33),
        surfaceContainerHighest: const Color(0xFF31353C),
      );

  static ThemeData get light => ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorScheme: _lightScheme,
    scaffoldBackgroundColor: AppColors.backgroundLight,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.surfaceLight,
      foregroundColor: AppColors.textPrimaryLight,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      systemOverlayStyle: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
        statusBarBrightness: Brightness.light,
        systemNavigationBarColor: Colors.transparent,
        systemNavigationBarIconBrightness: Brightness.dark,
        systemNavigationBarDividerColor: Colors.transparent,
      ),
    ),
    dividerTheme: const DividerThemeData(
      color: AppColors.borderLight,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.surfaceLight,
      indicatorColor: AppColors.primary.withValues(alpha: 0.12),
      elevation: 0,
    ),
  );

  static ThemeData get dark => ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: _darkScheme,
    scaffoldBackgroundColor: AppColors.backgroundDark,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.surfaceDark,
      foregroundColor: AppColors.textPrimaryDark,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      systemOverlayStyle: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
        systemNavigationBarColor: Colors.transparent,
        systemNavigationBarIconBrightness: Brightness.light,
        systemNavigationBarDividerColor: Colors.transparent,
      ),
    ),
    dividerTheme: const DividerThemeData(
      color: AppColors.borderDark,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.surfaceDark,
      indicatorColor: AppColors.primaryDark.withValues(alpha: 0.12),
      elevation: 0,
    ),
  );
}
