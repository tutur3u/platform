import 'dart:async';

import 'package:flutter/material.dart' hide ButtonStyle;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/view/app_lock_gate.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AppLockBoundary extends StatelessWidget {
  const AppLockBoundary({
    required this.child,
    this.excluded = false,
    super.key,
  });

  final Widget child;
  final bool excluded;

  @override
  Widget build(BuildContext context) {
    final authStatus = context.select<AuthCubit, AuthStatus>(
      (cubit) => cubit.state.status,
    );
    final appLockState = context.watch<AppLockCubit>().state;

    if (authStatus != AuthStatus.authenticated || excluded) {
      return child;
    }

    if (!appLockState.hasLoaded ||
        appLockState.status == AppLockStatus.loading) {
      return const _AppLockLoadingGate();
    }

    if (!appLockState.enabled || !appLockState.locked) {
      return child;
    }

    final l10n = context.l10n;

    return Stack(
      fit: StackFit.expand,
      children: [
        child,
        AppLockGate(
          authenticating: appLockState.status == AppLockStatus.authenticating,
          onUnlock: () {
            unawaited(
              context.read<AppLockCubit>().unlock(
                reason: l10n.appLockUnlockReason,
              ),
            );
          },
        ),
      ],
    );
  }
}

class _AppLockLoadingGate extends StatelessWidget {
  const _AppLockLoadingGate();

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return ColoredBox(
      color: theme.colorScheme.background,
      child: const SafeArea(
        child: Center(child: NovaLoadingIndicator()),
      ),
    );
  }
}
