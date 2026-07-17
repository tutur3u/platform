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

class AppLockBoundary extends StatefulWidget {
  const AppLockBoundary({
    required this.child,
    this.excluded = false,
    super.key,
  });

  final Widget child;
  final bool excluded;

  @override
  State<AppLockBoundary> createState() => _AppLockBoundaryState();
}

class _AppLockBoundaryState extends State<AppLockBoundary> {
  bool _requestedAutomaticUnlock = false;

  void _unlock(AppLocalizations l10n) {
    unawaited(
      context.read<AppLockCubit>().unlock(reason: l10n.appLockUnlockReason),
    );
  }

  void _requestAutomaticUnlock(AppLockState appLockState) {
    if (_requestedAutomaticUnlock ||
        appLockState.status != AppLockStatus.idle) {
      return;
    }

    _requestedAutomaticUnlock = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      final currentState = context.read<AppLockCubit>().state;
      if (!currentState.enabled ||
          !currentState.locked ||
          currentState.status != AppLockStatus.idle) {
        return;
      }
      _unlock(context.l10n);
    });
  }

  @override
  Widget build(BuildContext context) {
    final authStatus = context.select<AuthCubit, AuthStatus>(
      (cubit) => cubit.state.status,
    );
    final appLockState = context.watch<AppLockCubit>().state;

    if (authStatus != AuthStatus.authenticated || widget.excluded) {
      _requestedAutomaticUnlock = false;
      return widget.child;
    }

    if (!appLockState.hasLoaded ||
        appLockState.status == AppLockStatus.loading) {
      return const _AppLockLoadingGate();
    }

    if (!appLockState.enabled || !appLockState.locked) {
      _requestedAutomaticUnlock = false;
      return widget.child;
    }

    final l10n = context.l10n;
    _requestAutomaticUnlock(appLockState);

    return Stack(
      fit: StackFit.expand,
      children: [
        widget.child,
        AppLockGate(
          authenticating: appLockState.status == AppLockStatus.authenticating,
          onUnlock: () => _unlock(l10n),
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
