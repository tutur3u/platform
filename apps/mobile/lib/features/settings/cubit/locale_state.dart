import 'dart:ui';

import 'package:equatable/equatable.dart';

/// State for the locale cubit.
///
/// [locale] is `null` when following the system default.
class LocaleState extends Equatable {
  const LocaleState({this.locale});

  final Locale? locale;

  LocaleState copyWith({Locale? locale, bool clearLocale = false}) =>
      LocaleState(locale: clearLocale ? null : (locale ?? this.locale));

  @override
  List<Object?> get props => [locale];
}
