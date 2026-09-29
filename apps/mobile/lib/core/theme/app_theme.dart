import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/theme/colors.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Material 3 theme data for light and dark modes.
abstract final class AppTheme {
  static const _pageTransitions = PageTransitionsTheme(
    builders: {
      TargetPlatform.android: _SmoothPageTransitionsBuilder(),
      TargetPlatform.fuchsia: _SmoothPageTransitionsBuilder(),
      TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
      TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
      TargetPlatform.linux: _SmoothPageTransitionsBuilder(),
      TargetPlatform.windows: _SmoothPageTransitionsBuilder(),
    },
  );

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

  static SystemUiOverlayStyle systemUiOverlayStyleFor(Brightness brightness) {
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

  static final ColorScheme _lightScheme =
      ColorScheme.fromSeed(
        seedColor: AppColors.primary,
        surface: AppColors.backgroundLight,
      ).copyWith(
        // Keep Material controls neutral alongside the app's zinc Shad theme.
        primary: AppColors.textPrimaryLight,
        onPrimary: AppColors.surfaceLight,
        primaryContainer: const Color(0xFFE5DED2),
        onPrimaryContainer: AppColors.textPrimaryLight,
        secondary: const Color(0xFF3F3F46),
        onSecondary: AppColors.surfaceLight,
        secondaryContainer: const Color(0xFFF4EFE7),
        onSecondaryContainer: AppColors.textPrimaryLight,
        tertiary: const Color(0xFF52525B),
        onTertiary: AppColors.surfaceLight,
        tertiaryContainer: const Color(0xFFEDE7DD),
        onTertiaryContainer: AppColors.textPrimaryLight,
        onSurface: AppColors.textPrimaryLight,
        onSurfaceVariant: AppColors.textSecondaryLight,
        outline: AppColors.borderLight,
        outlineVariant: AppColors.borderLight,
        inverseSurface: AppColors.surfaceDark,
        onInverseSurface: AppColors.textPrimaryDark,
        inversePrimary: AppColors.textPrimaryDark,
        surfaceTint: Colors.transparent,
        surface: AppColors.backgroundLight,
        surfaceContainerLowest: AppColors.surfaceLight,
        surfaceContainerLow: const Color(0xFFF9F6F0),
        surfaceContainer: const Color(0xFFF4EFE7),
        surfaceContainerHigh: const Color(0xFFEDE7DD),
        surfaceContainerHighest: const Color(0xFFE5DED2),
      );

  static final ColorScheme _darkScheme =
      ColorScheme.fromSeed(
        seedColor: AppColors.primaryDark,
        brightness: Brightness.dark,
        surface: AppColors.backgroundDark,
      ).copyWith(
        primary: AppColors.textPrimaryDark,
        onPrimary: AppColors.backgroundDark,
        primaryContainer: const Color(0xFF31353C),
        onPrimaryContainer: AppColors.textPrimaryDark,
        secondary: const Color(0xFFD4D4D8),
        onSecondary: AppColors.backgroundDark,
        secondaryContainer: const Color(0xFF23262B),
        onSecondaryContainer: AppColors.textPrimaryDark,
        tertiary: const Color(0xFFA1A1AA),
        onTertiary: AppColors.backgroundDark,
        tertiaryContainer: const Color(0xFF2A2D33),
        onTertiaryContainer: AppColors.textPrimaryDark,
        onSurface: AppColors.textPrimaryDark,
        onSurfaceVariant: AppColors.textSecondaryDark,
        outline: AppColors.borderDark,
        outlineVariant: AppColors.borderDark,
        inverseSurface: AppColors.surfaceLight,
        onInverseSurface: AppColors.textPrimaryLight,
        inversePrimary: AppColors.textPrimaryLight,
        surfaceTint: Colors.transparent,
        surface: AppColors.backgroundDark,
        surfaceContainerLowest: AppColors.surfaceDark,
        surfaceContainerLow: const Color(0xFF1C1E22),
        surfaceContainer: const Color(0xFF23262B),
        surfaceContainerHigh: const Color(0xFF2A2D33),
        surfaceContainerHighest: const Color(0xFF31353C),
      );

  static final ThemeData light = ThemeData(
    useMaterial3: true,
    pageTransitionsTheme: _pageTransitions,
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
    dividerTheme: const DividerThemeData(color: AppColors.borderLight),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: _lightScheme.surfaceContainerHigh,
      contentTextStyle: TextStyle(color: _lightScheme.onSurface),
      actionTextColor: _lightScheme.primary,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.surfaceLight,
      indicatorColor: _lightScheme.primary.withValues(alpha: 0.12),
      elevation: 0,
    ),
  );

  static final ThemeData dark = ThemeData(
    useMaterial3: true,
    pageTransitionsTheme: _pageTransitions,
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
    dividerTheme: const DividerThemeData(color: AppColors.borderDark),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: _darkScheme.surfaceContainerHigh,
      contentTextStyle: TextStyle(color: _darkScheme.onSurface),
      actionTextColor: _darkScheme.primary,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.surfaceDark,
      indicatorColor: _darkScheme.primary.withValues(alpha: 0.12),
      elevation: 0,
    ),
  );
}

class _SmoothPageTransitionsBuilder extends PageTransitionsBuilder {
  const _SmoothPageTransitionsBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    if (MediaQuery.disableAnimationsOf(context)) return child;
    final enter = animation.drive(CurveTween(curve: Curves.easeOutCubic));
    final exit = secondaryAnimation.drive(
      CurveTween(curve: Curves.easeOutCubic),
    );
    return SlideTransition(
      position: Tween<Offset>(
        begin: Offset.zero,
        end: const Offset(-0.025, 0),
      ).animate(exit),
      child: FadeTransition(
        opacity: Tween<double>(begin: 0.88, end: 1).animate(enter),
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0.045, 0),
            end: Offset.zero,
          ).animate(enter),
          child: child,
        ),
      ),
    );
  }
}
