import 'dart:async';

import 'package:flutter/material.dart' hide ButtonStyle;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/view/app_lock_gate.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_splash_surface.dart';

class AppLockBoundary extends StatefulWidget {
  const AppLockBoundary({
    required this.child,
    this.excluded = false,
    this.isExcluded,
    this.routeChanges,
    super.key,
  });

  final Widget child;
  final bool excluded;
  final bool Function()? isExcluded;
  final Listenable? routeChanges;

  @override
  State<AppLockBoundary> createState() => _AppLockBoundaryState();
}

class _AppLockBoundaryState extends State<AppLockBoundary>
    with WidgetsBindingObserver {
  bool _requestedAutomaticUnlock = false;
  bool _foreground = _isForeground(WidgetsBinding.instance.lifecycleState);

  static bool _isForeground(AppLifecycleState? state) =>
      state == null || state == AppLifecycleState.resumed;

  bool get _excluded => widget.isExcluded?.call() ?? widget.excluded;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final foreground = _isForeground(state);
    if (foreground != _foreground) setState(() => _foreground = foreground);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  void _unlock() {
    unawaited(
      context.read<AppLockCubit>().unlock(
        reason: context.l10n.appLockUnlockReason,
      ),
    );
  }

  void _requestAutomaticUnlock() {
    if (_requestedAutomaticUnlock) return;
    _requestedAutomaticUnlock = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_foreground || _excluded) return;
      final state = context.read<AppLockCubit>().state;
      if (state.locked && state.status == AppLockStatus.idle) _unlock();
    });
  }

  Widget _paint(BuildContext context) {
    final lock = context.watch<AppLockCubit>().state;
    final protected = !_excluded;
    final loading =
        protected && (!lock.hasLoaded || lock.status == AppLockStatus.loading);
    final locked = protected && lock.enabled && lock.locked;
    final screenCovered = !_foreground || loading || locked;

    if (!locked) _requestedAutomaticUnlock = false;
    if (_foreground && locked && lock.status == AppLockStatus.idle) {
      _requestAutomaticUnlock();
    }

    return Stack(
      fit: StackFit.expand,
      children: [
        Offstage(
          offstage: screenCovered,
          child: ExcludeFocus(excluding: screenCovered, child: widget.child),
        ),
        if (!_foreground || loading)
          const AppSplashSurface(key: ValueKey('app-lock-privacy-cover'))
        else if (locked)
          AppLockGate(
            showUnlockImmediately: lock.showUnlockImmediately,
            authenticating: lock.status == AppLockStatus.authenticating,
            onUnlock: _unlock,
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final routes = widget.routeChanges;
    return routes == null
        ? _paint(context)
        : ListenableBuilder(
            listenable: routes,
            builder: (context, _) => _paint(context),
          );
  }
}
