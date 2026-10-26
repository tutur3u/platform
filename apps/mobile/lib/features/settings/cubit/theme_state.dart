import 'package:equatable/equatable.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart';

/// State for the theme cubit: light/dark mode plus appearance customisation.
class ThemeState extends Equatable {
  const ThemeState({
    this.themeMode = ThemeMode.system,
    this.appearance = const AppearanceSettings(),
    this.deviceOverride = false,
    this.hasAccount = false,
  });

  final ThemeMode themeMode;
  final AppearanceSettings appearance;

  /// This device keeps its own appearance instead of the account's.
  final bool deviceOverride;

  /// A signed-in account is bound, so the device override applies.
  final bool hasAccount;

  ThemeState copyWith({
    ThemeMode? themeMode,
    AppearanceSettings? appearance,
    bool? deviceOverride,
    bool? hasAccount,
  }) => ThemeState(
    themeMode: themeMode ?? this.themeMode,
    appearance: appearance ?? this.appearance,
    deviceOverride: deviceOverride ?? this.deviceOverride,
    hasAccount: hasAccount ?? this.hasAccount,
  );

  @override
  List<Object?> get props => [themeMode, appearance, deviceOverride, hasAccount];
}
