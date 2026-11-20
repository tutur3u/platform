import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' hide ButtonStyle;
import 'package:flutter/scheduler.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/app_router.dart';
import 'package:mobile/core/router/router_location.dart';
import 'package:mobile/core/ui/components/account_overlay_scope.dart';
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
    this.nativePrivacyReady,
    this.accountIdentity,
    super.key,
  });

  AppLockBoundary.router({
    required GoRouter router,
    required this.child,
    this.nativePrivacyReady,
    this.accountIdentity,
    super.key,
  }) : excluded = false,
       isExcluded = (() =>
           isAppLockExcludedRoute(router.currentMatchedLocation)),
       routeChanges = router.routerDelegate;

  final Widget child;
  final bool excluded;
  final bool Function()? isExcluded;
  final Listenable? routeChanges;
  final ValueListenable<bool>? nativePrivacyReady;
  final String? accountIdentity;

  @override
  State<AppLockBoundary> createState() => _AppLockBoundaryState();
}

class _AppLockBoundaryState extends State<AppLockBoundary>
    with WidgetsBindingObserver {
  bool _requestedAutomaticUnlock = false;
  Object _overlayEpoch = Object();
  bool? _overlaysAllowed;
  bool _foreground = _isForeground(WidgetsBinding.instance.lifecycleState);

  static bool _isForeground(AppLifecycleState? state) =>
      state == null || state == AppLifecycleState.resumed;

  bool get _excluded => widget.isExcluded?.call() ?? widget.excluded;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.routeChanges?.addListener(_routeChanged);
  }

  @override
  void didUpdateWidget(covariant AppLockBoundary oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.accountIdentity != widget.accountIdentity) {
      _overlayEpoch = Object();
    }
    if (oldWidget.routeChanges == widget.routeChanges) return;
    oldWidget.routeChanges?.removeListener(_routeChanged);
    widget.routeChanges?.addListener(_routeChanged);
  }

  void _routeChanged() {
    if (SchedulerBinding.instance.schedulerPhase ==
        SchedulerPhase.persistentCallbacks) {
      // The router can restore its configuration while its subtree builds.
      scheduleMicrotask(() {
        if (mounted) setState(() {});
      });
      return;
    }
    setState(() {});
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final foreground = _isForeground(state);
    if (foreground != _foreground) setState(() => _foreground = foreground);
  }

  @override
  void dispose() {
    widget.routeChanges?.removeListener(_routeChanged);
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
    final nativeReady = widget.nativePrivacyReady?.value ?? true;
    final checkRouteAtPaint =
        !protected &&
        (!lock.hasLoaded ||
            lock.status == AppLockStatus.loading ||
            lock.locked);
    final screenCovered = !_foreground || loading || locked || !nativeReady;
    final overlaysAllowed =
        !screenCovered &&
        !lock.locked &&
        (widget.accountIdentity == null ||
            (lock.hasLoaded && lock.status != AppLockStatus.loading));
    if (_overlaysAllowed != overlaysAllowed) {
      _overlaysAllowed = overlaysAllowed;
      _overlayEpoch = Object();
    }

    if (!locked) _requestedAutomaticUnlock = false;
    if (_foreground && locked && lock.status == AppLockStatus.idle) {
      _requestAutomaticUnlock();
    }

    return Stack(
      fit: StackFit.expand,
      children: [
        Offstage(
          offstage: screenCovered,
          child: ExcludeFocus(
            excluding: screenCovered,
            child: ClipRect(
              // A synchronous router restore cannot expose the new route
              // between the build and the next privacy-boundary rebuild.
              clipBehavior: checkRouteAtPaint ? Clip.hardEdge : Clip.none,
              clipper: checkRouteAtPaint
                  ? _ExcludedRouteClip(() => _excluded, widget.routeChanges)
                  : null,
              child: AccountOverlayScope(
                epoch: _overlayEpoch,
                allowed: overlaysAllowed,
                child: widget.child,
              ),
            ),
          ),
        ),
        if (!_foreground || loading || (!nativeReady && !locked))
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
    final privacy = widget.nativePrivacyReady;
    if (privacy == null) return _paint(context);
    return ListenableBuilder(
      listenable: privacy,
      builder: (context, _) => _paint(context),
    );
  }
}

class _ExcludedRouteClip extends CustomClipper<Rect> {
  _ExcludedRouteClip(this.isExcluded, Listenable? changes)
    : super(reclip: changes);

  final bool Function() isExcluded;

  @override
  Rect getClip(Size size) => isExcluded() ? Offset.zero & size : Rect.zero;

  @override
  bool shouldReclip(covariant _ExcludedRouteClip oldClipper) => true;
}
