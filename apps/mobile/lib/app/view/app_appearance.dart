import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/cubit/sorbet_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';

/// The appearance state the app owns: the classic appearance ([theme]) and
/// the Sorbet opt-in ([sorbet]). Both follow the signed-in account.
class AppAppearance {
  AppAppearance(this.theme, {SorbetCubit? sorbet})
    : sorbet = sorbet ?? SorbetCubit();

  final ThemeCubit theme;
  final SorbetCubit sorbet;

  /// The account whose appearance applies: the authenticated user, or null.
  static String? accountId(AuthState state) =>
      state.status == AuthStatus.authenticated ? state.user?.id : null;

  /// The active Sorbet theme below the app's providers, or null for classic.
  static SorbetTheme? sorbetOf(BuildContext context) =>
      context.watch<SorbetCubit>().state.active;

  /// Appearance follows the account unless this device overrides it.
  void bindAccount(String? userId) {
    unawaited(theme.bindAccount(userId));
    unawaited(sorbet.bindAccount(userId));
  }

  List<BlocProvider<Object?>> get providers => [
    BlocProvider<ThemeCubit>.value(value: theme),
    BlocProvider<SorbetCubit>.value(value: sorbet),
  ];

  void close() {
    unawaited(theme.close());
    unawaited(sorbet.close());
  }
}
