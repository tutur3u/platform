import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
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
/// (none after logout) whenever [mastermindAuthNeedsReset] says so.
BlocListener<AuthCubit, AuthState> mastermindAuthResetListener(
  MastermindRuntime runtime,
) => BlocListener<AuthCubit, AuthState>(
  listenWhen: mastermindAuthNeedsReset,
  listener: (context, state) => unawaited(
    runtime.reset(
      wsId: state.status == AuthStatus.authenticated
          ? context.read<WorkspaceCubit>().state.currentWorkspace?.id
          : null,
    ),
  ),
);
