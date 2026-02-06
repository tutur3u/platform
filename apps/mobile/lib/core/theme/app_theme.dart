import 'package:flutter/material.dart';
import 'package:mobile/core/theme/colors.dart';

/// Material 3 theme data for light and dark modes.
abstract final class AppTheme {
  static ThemeData get light => ThemeData(
        useMaterial3: true,
        brightness: Brightness.light,
        colorSchemeSeed: AppColors.primary,
        scaffoldBackgroundColor: AppColors.backgroundLight,
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.backgroundLight,
          foregroundColor: AppColors.textPrimaryLight,
          elevation: 0,
          scrolledUnderElevation: 0.5,
        ),
        dividerTheme: const DividerThemeData(
          color: AppColors.borderLight,
        ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: AppColors.backgroundLight,
          indicatorColor: AppColors.primary.withValues(alpha: 0.12),
          elevation: 0,
        ),
      );

  static ThemeData get dark => ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorSchemeSeed: AppColors.primaryDark,
        scaffoldBackgroundColor: AppColors.backgroundDark,
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.backgroundDark,
          foregroundColor: AppColors.textPrimaryDark,
          elevation: 0,
          scrolledUnderElevation: 0.5,
        ),
        dividerTheme: const DividerThemeData(
          color: AppColors.borderDark,
        ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: AppColors.backgroundDark,
          indicatorColor: AppColors.primaryDark.withValues(alpha: 0.12),
          elevation: 0,
        ),
      );
}
