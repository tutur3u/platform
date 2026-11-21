import 'dart:async';

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
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// Shows the unlock screen over protected routes while an opted-in App Lock
/// is locked.
///
/// App Lock off leaves the UI untouched. App-switcher privacy is handled
/// natively, because Flutter draws no frames once the app is in the
/// background. The first settings read after sign-in shows a loading splash so
/// a locked device never flashes content.
class AppLockBoundary extends StatefulWidget {
  const AppLockBoundary({
    required this.child,
    this.excluded = false,
    this.isExcluded,
    this.routeChanges,
    this.accountIdentity,
    super.key,
  });

  AppLockBoundary.router({
    required GoRouter router,
    required this.child,
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

  @override
  Widget build(BuildContext context) {
    final lock = context.watch<AppLockCubit>().state;
    final protected = !_excluded;
    final firstLoad = protected && !lock.hasLoaded;
    final locked = protected && lock.enabled && lock.locked;
    final hidden = firstLoad || locked;
    final checkRouteAtPaint = !protected && (!lock.hasLoaded || lock.locked);
    final overlaysAllowed =
        !hidden &&
        !lock.locked &&
        (widget.accountIdentity == null || lock.hasLoaded);
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
          offstage: hidden,
          child: ExcludeFocus(
            excluding: hidden,
            child: ClipRect(
              // A synchronous router restore cannot expose the new route
              // between the build and the next boundary rebuild.
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
        if (locked)
          AppLockGate(
            authenticating: lock.status == AppLockStatus.authenticating,
            failed: lock.error != null,
            onUnlock: _unlock,
          )
        else if (firstLoad)
          const AppSplashSurface(
            key: ValueKey('app-lock-loading'),
            child: Align(
              alignment: Alignment(0, 0.4),
              child: NovaLoadingIndicator(),
            ),
          ),
      ],
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
