import 'package:equatable/equatable.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart';

/// State for the theme cubit.
class ThemeState extends Equatable {
  const ThemeState({this.themeMode = ThemeMode.system});

  final ThemeMode themeMode;

  ThemeState copyWith({ThemeMode? themeMode}) =>
      ThemeState(themeMode: themeMode ?? this.themeMode);

  @override
  List<Object?> get props => [themeMode];
}
