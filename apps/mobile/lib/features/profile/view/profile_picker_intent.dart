import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';

/// Captures the native chooser's owner before every asynchronous stage.
class ProfilePickerIntent {
  ProfilePickerIntent._(this.auth, this.cubit, this.actor) {
    _subscription = auth.stream.listen((state) {
      if (state.user?.id != actor || state.status != AuthStatus.authenticated) {
        _departed = true;
      }
    });
  }
  static ProfilePickerIntent? capture(BuildContext context) {
    final auth = context.read<AuthCubit>();
    final cubit = context.read<ProfileCubit>();
    final actor = auth.state.user?.id;
    if (actor == null ||
        auth.state.status != AuthStatus.authenticated ||
        auth.isClosed ||
        cubit.isClosed ||
        cubit.state.profile?.id != actor) {
      return null;
    }
    return ProfilePickerIntent._(auth, cubit, actor);
  }

  final AuthCubit auth;
  final ProfileCubit cubit;
  final String actor;
  late final StreamSubscription<AuthState> _subscription;
  bool _departed = false;
  bool current(BuildContext context) =>
      context.mounted &&
      !_departed &&
      !auth.isClosed &&
      !cubit.isClosed &&
      identical(context.read<AuthCubit>(), auth) &&
      identical(context.read<ProfileCubit>(), cubit) &&
      auth.state.user?.id == actor &&
      auth.state.status == AuthStatus.authenticated &&
      cubit.state.profile?.id == actor;
  Future<void> dispose() async {
    _departed = true;
    await _subscription.cancel();
  }
}
