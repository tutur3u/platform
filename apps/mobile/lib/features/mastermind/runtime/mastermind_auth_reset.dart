import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';

/// Logout or account switch: the held snapshot belongs to the previous account
/// and must not outlive it.
bool mastermindAuthNeedsReset(AuthState previous, AuthState current) =>
    (current.status == AuthStatus.unauthenticated &&
        previous.status != AuthStatus.unauthenticated) ||
    (previous.user?.id != null &&
        current.user?.id != null &&
        previous.user?.id != current.user?.id);

/// Erases the cache and re-checks access for the workspace now selected
/// (none after logout) whenever [mastermindAuthNeedsReset] says so. The
/// account that signed out or was switched away from also loses its cached
/// thread lists.
BlocListener<AuthCubit, AuthState> mastermindAuthResetListener(
  MastermindRuntime runtime,
) {
  String? leaving;
  return BlocListener<AuthCubit, AuthState>(
    listenWhen: (previous, current) {
      final reset = mastermindAuthNeedsReset(previous, current);
      if (reset) leaving = previous.user?.id;
      return reset;
    },
    listener: (context, state) {
      // Sign-out and a direct switch alike: the account that left takes
      // its cached thread lists and this session's Projects memory along.
      if (leaving case final userId? when userId != state.user?.id) {
        unawaited(runtime.threadCache?.clear(userId));
        unawaited(runtime.projectIds?.clear(userId));
        resetSharedProjectsRepository();
      }
      unawaited(
        runtime.reset(
          wsId: state.status == AuthStatus.authenticated
              ? context.read<WorkspaceCubit>().state.currentWorkspace?.id
              : null,
        ),
      );
    },
  );
}
