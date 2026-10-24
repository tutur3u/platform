import 'package:equatable/equatable.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart';

/// State for the theme cubit: light/dark mode plus appearance customisation.
class ThemeState extends Equatable {
  const ThemeState({
    this.themeMode = ThemeMode.system,
    this.appearance = const AppearanceSettings(),
  });

  final ThemeMode themeMode;
  final AppearanceSettings appearance;

  ThemeState copyWith({ThemeMode? themeMode, AppearanceSettings? appearance}) =>
      ThemeState(
        themeMode: themeMode ?? this.themeMode,
        appearance: appearance ?? this.appearance,
      );

  @override
  List<Object?> get props => [themeMode, appearance];
}
