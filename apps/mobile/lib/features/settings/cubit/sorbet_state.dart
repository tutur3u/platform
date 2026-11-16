import 'package:equatable/equatable.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';

/// The Sorbet opt-in and look shown on this device.
class SorbetState extends Equatable {
  const SorbetState({this.preferences = const SorbetPreferences()});

  final SorbetPreferences preferences;

  bool get enabled => preferences.enabled;
  SorbetTheme get theme => preferences.theme;

  /// The theme to apply, or null while the classic design shows.
  SorbetTheme? get active => preferences.active;

  @override
  List<Object?> get props => [preferences];
}
