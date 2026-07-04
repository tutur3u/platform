import 'dart:async';

import 'package:flutter/material.dart' hide ButtonStyle;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
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

    final theme = shad.Theme.of(context);
    final l10n = context.l10n;

    return Stack(
      fit: StackFit.expand,
      children: [
        child,
        ColoredBox(
          color: theme.colorScheme.background,
          child: SafeArea(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 360),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 64,
                        height: 64,
                        decoration: BoxDecoration(
                          color: theme.colorScheme.primary.withValues(
                            alpha: 0.12,
                          ),
                          shape: BoxShape.circle,
                        ),
                        alignment: Alignment.center,
                        child: Icon(
                          Icons.lock_outline_rounded,
                          color: theme.colorScheme.primary,
                          size: 30,
                        ),
                      ),
                      const shad.Gap(18),
                      Text(
                        l10n.appLockLockedTitle,
                        textAlign: TextAlign.center,
                        style: theme.typography.h3.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const shad.Gap(8),
                      Text(
                        l10n.appLockLockedDescription,
                        textAlign: TextAlign.center,
                        style: theme.typography.textSmall.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                      const shad.Gap(24),
                      SizedBox(
                        width: double.infinity,
                        child: shad.PrimaryButton(
                          enabled:
                              appLockState.status !=
                              AppLockStatus.authenticating,
                          onPressed: () {
                            unawaited(
                              context.read<AppLockCubit>().unlock(
                                reason: l10n.appLockUnlockReason,
                              ),
                            );
                          },
                          child:
                              appLockState.status ==
                                  AppLockStatus.authenticating
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : Text(l10n.appLockUnlockAction),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
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
