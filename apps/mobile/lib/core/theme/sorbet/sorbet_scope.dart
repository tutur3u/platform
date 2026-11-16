import 'package:flutter/widgets.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';

/// Publishes the active Sorbet theme, or null while the classic design
/// applies. The app keeps this widget in place either way, so toggling
/// Sorbet never changes the tree shape.
class SorbetScope extends InheritedWidget {
  const SorbetScope({required this.theme, required super.child, super.key});

  final SorbetTheme? theme;

  static SorbetTheme? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<SorbetScope>()?.theme;

  @override
  bool updateShouldNotify(SorbetScope oldWidget) => theme != oldWidget.theme;
}

/// Picks the appearance the app paints. With no Sorbet theme the result is
/// the classic object itself.
abstract final class AppThemeSelection {
  /// Sorbet paints solid pages, so ambient backgrounds are switched off.
  static AppearanceSettings backdrop(
    AppearanceSettings appearance,
    SorbetTheme? sorbet,
  ) => sorbet == null || !appearance.hasAmbientBackground
      ? appearance
      : appearance.copyWith(backgroundStyle: AppearanceBackgroundStyle.solid);
}

/// The app-level appearance host: publishes [sorbet] and paints the
/// appearance backdrop, solid while Sorbet is on.
class SorbetAppearanceHost extends StatelessWidget {
  const SorbetAppearanceHost({
    required this.appearance,
    required this.sorbet,
    required this.child,
    super.key,
  });

  final AppearanceSettings appearance;
  final SorbetTheme? sorbet;
  final Widget child;

  @override
  Widget build(BuildContext context) => SorbetScope(
    theme: sorbet,
    child: AppearanceBackdrop(
      settings: AppThemeSelection.backdrop(appearance, sorbet),
      child: child,
    ),
  );
}
