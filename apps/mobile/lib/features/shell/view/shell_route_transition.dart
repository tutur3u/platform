import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/features/shell/view/shell_route_motion.dart';

/// Follows the shell route that is pushing, popping or being swiped back, so
/// chrome outside the nested navigator (the top bar title and the dock
/// contents) can run the same timeline as the page body.
///
/// Routes report from their transition builder, which runs during build, so
/// listeners may only retarget animations there. Structural changes wait for
/// the next frame.
class ShellRouteTransitionController extends ChangeNotifier {
  ModalRoute<Object?>? _route;
  Animation<double>? _source;
  Animation<double>? _animation;
  String? _topLocation;
  String? _belowLocation;
  bool _reduced = false;
  bool _back = false;

  /// Whether a shell route transition is running or being scrubbed.
  bool get active => _animation != null;

  /// The transitioning route's animation: 0 while the upper page is off
  /// screen, 1 once it has settled.
  Animation<double> get animation => _animation ?? kAlwaysCompleteAnimation;

  /// Location of the upper route of the running transition.
  String? get topLocation => _topLocation;

  /// Location of the page under the transitioning route: the route below
  /// it, or for a forward move without one, the location it was opened
  /// from. Null when a swipe has no shell page below.
  String? get belowLocation => _belowLocation;

  /// Whether the route at [location] is leaving through a pop or swipe.
  bool poppingFrom(String location) =>
      _source?.status == AnimationStatus.reverse &&
      !_back &&
      _topLocation == normalizeShellRouteLocation(location);

  /// Whether the running transition is the reduced-motion cross-fade.
  bool get reduced => _reduced;

  /// Whether a route other than [route] is arriving through Back, so
  /// [route] leaves as if popped.
  bool backArrivalAbove(ModalRoute<Object?> route) =>
      _back && !identical(route, _route);

  /// Called by a shell route each time its transition builds. A Back
  /// arrival reports the page it replaces as the upper one, with the
  /// timeline reversed, so the chrome runs a pop.
  void report(
    ModalRoute<Object?> route, {
    required String location,
    required bool reduced,
    String? below,
    String? backFrom,
  }) {
    final animation = route.animation;
    if (animation == null || !animation.isAnimating) return;
    if (identical(route, _route)) return;
    _detach();
    _route = route;
    _source = animation..addStatusListener(_onStatus);
    _back = backFrom != null;
    _animation = _back ? MappedAnimation(animation, (v) => 1 - v) : animation;
    _topLocation = normalizeShellRouteLocation(backFrom ?? location);
    _belowLocation = below == null || _back
        ? null
        : normalizeShellRouteLocation(below);
    _reduced = reduced;
    notifyListeners();
  }

  void _onStatus(AnimationStatus status) {
    if (status.isAnimating) return;
    _detach();
    notifyListeners();
  }

  void _detach() {
    _source?.removeStatusListener(_onStatus);
    _source = null;
    _animation = null;
    _route = null;
    _topLocation = null;
    _belowLocation = null;
    _back = false;
  }

  @override
  void dispose() {
    _detach();
    super.dispose();
  }
}

String normalizeShellRouteLocation(String location) =>
    location.length > 1 && location.endsWith('/')
    ? location.substring(0, location.length - 1)
    : location;

/// Gives shell chrome the current location and the route transition
/// controller.
class ShellRouteTransitionScope extends InheritedWidget {
  const ShellRouteTransitionScope({
    required this.controller,
    required this.location,
    required super.child,
    this.previousLocation,
    this.arrivedBack = false,
    this.animates = _always,
    this.interceptsBack = _never,
    this.hasNotificationsOrigin = _never,
    super.key,
  });

  final ShellRouteTransitionController controller;
  final String location;

  /// The location shown before [location].
  final String? previousLocation;

  /// Whether [location] was reached through Back.
  final bool arrivedBack;

  /// Whether moving between two locations runs a route transition. Root
  /// destinations swap in place, so their chrome changes without one.
  final bool Function(String from, String to) animates;

  /// Whether Back at [location] runs shell handling that a swipe would
  /// skip; the edge swipe is off while it does.
  final bool Function() interceptsBack;

  /// Whether the current page was opened from Notifications, so the shell's
  /// Back returns there in one step.
  final bool Function() hasNotificationsOrigin;

  static bool _always(String from, String to) => true;
  static bool _never() => false;

  static ShellRouteTransitionScope? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<ShellRouteTransitionScope>();

  /// Looks the scope up without rebuilding [context] when it changes.
  static ShellRouteTransitionScope? peek(BuildContext? context) =>
      context?.getInheritedWidgetOfExactType<ShellRouteTransitionScope>();

  @override
  bool updateShouldNotify(ShellRouteTransitionScope oldWidget) =>
      location != oldWidget.location || controller != oldWidget.controller;
}

/// Wraps every builder route of the shell's navigator in a
/// [ShellTransitionPage]. Routes with their own page builder or a parent
/// navigator keep their configuration.
List<RouteBase> shellTransitionRoutes(List<RouteBase> routes) => [
  for (final route in routes) _withShellTransition(route),
];

RouteBase _withShellTransition(RouteBase route) {
  if (route is! GoRoute ||
      route.pageBuilder != null ||
      route.parentNavigatorKey != null) {
    return route;
  }
  final builder = route.builder;
  return GoRoute(
    path: route.path,
    name: route.name,
    redirect: route.redirect,
    metadata: route.metadata,
    onExit: route.onExit,
    caseSensitive: route.caseSensitive,
    routes: shellTransitionRoutes(route.routes),
    pageBuilder: builder == null
        ? null
        : (context, state) => ShellTransitionPage<void>(
            key: state.pageKey,
            name: state.name ?? state.path,
            arguments: <String, String>{
              ...state.pathParameters,
              ...state.uri.queryParameters,
            },
            restorationId: state.pageKey.value,
            location: state.matchedLocation,
            child: builder(context, state),
          ),
  );
}

/// A shell page: the body slides over the page it covers while the shell's
/// chrome cross-fades on the same timeline.
class ShellTransitionPage<T> extends Page<T> {
  const ShellTransitionPage({
    required this.child,
    required this.location,
    super.key,
    super.name,
    super.arguments,
    super.restorationId,
  });

  final Widget child;

  /// The location this page shows, matched against the shell's location.
  final String location;

  @override
  Route<T> createRoute(BuildContext context) => _ShellTransitionRoute<T>(this);
}

class _ShellTransitionRoute<T> extends PageRoute<T> {
  _ShellTransitionRoute(ShellTransitionPage<T> page) : super(settings: page);

  ShellTransitionPage<T> get _page => settings as ShellTransitionPage<T>;

  /// The location this route replaced when it arrived through Back.
  String? _backFrom;

  /// Whether this push is a sibling swap that changes in place.
  bool _instant = false;

  /// The route below this one, for the chrome's retained layer.
  Route<dynamic>? _below;

  /// The shell location this route was opened from. A `go` between flat
  /// routes replaces the page it leaves, which is then never linked below
  /// this route, so a forward move names it from here.
  String? _openedFrom;

  @override
  void didChangePrevious(Route<dynamic>? previousRoute) {
    _below = previousRoute;
    super.didChangePrevious(previousRoute);
  }

  @override
  bool get popGestureEnabled =>
      super.popGestureEnabled &&
      !(ShellRouteTransitionScope.peek(navigator?.context)?.interceptsBack() ??
          false);

  bool get _reduced =>
      navigator?.context
          .getInheritedWidgetOfExactType<MediaQuery>()
          ?.data
          .disableAnimations ??
      false;

  @override
  Duration get transitionDuration =>
      _reduced ? ShellRouteMotion.reducedDuration : ShellRouteMotion.duration;

  @override
  bool get maintainState => true;

  @override
  Color? get barrierColor => null;

  @override
  String? get barrierLabel => null;

  /// Reduced motion can change between transitions.
  void _syncDuration() {
    final duration = _instant ? Duration.zero : transitionDuration;
    controller
      ?..duration = duration
      ..reverseDuration = duration;
  }

  @override
  TickerFuture didPush() {
    final scope = ShellRouteTransitionScope.peek(navigator?.context);
    final from = scope?.previousLocation;
    _instant = from != null && !scope!.animates(from, _page.location);
    _backFrom = !_instant && (scope?.arrivedBack ?? false) ? from : null;
    _openedFrom = _instant ? null : from;
    _syncDuration();
    return super.didPush();
  }

  @override
  bool didPop(T? result) {
    _instant = false;
    _backFrom = null;
    _syncDuration();
    final popped = super.didPop(result);
    // Report before the router moves the shell to the location below, so
    // the shell can tell this pop from a navigation that follows it.
    _report(navigator?.context, reduced: _reduced);
    return popped;
  }

  void _report(BuildContext? context, {required bool reduced}) {
    final below = _below?.settings;
    ShellRouteTransitionScope.peek(context)?.controller.report(
      this,
      location: _page.location,
      reduced: reduced,
      // A swipe only scrubs towards the page actually below.
      below: below is ShellTransitionPage
          ? below.location
          : popGestureInProgress
          ? null
          : _openedFrom,
      backFrom: _backFrom,
    );
  }

  @override
  bool canTransitionTo(TransitionRoute<dynamic> nextRoute) =>
      nextRoute is _ShellTransitionRoute;

  @override
  bool canTransitionFrom(TransitionRoute<dynamic> previousRoute) =>
      previousRoute is _ShellTransitionRoute;

  @override
  Widget buildPage(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
  ) => Semantics(
    scopesRoute: true,
    explicitChildNodes: true,
    child: _page.child,
  );

  @override
  Widget buildTransitions(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final reduced = MediaQuery.disableAnimationsOf(context);
    // A Back arrival plays as a pop only while it arrives; a later swipe on
    // this route is an ordinary pop. The route's own controller decides, as
    // [animation] stands complete while the route is measured offstage.
    if ((controller?.isCompleted ?? false) || popGestureInProgress) {
      _backFrom = null;
    }
    _report(context, reduced: reduced);
    final transitions = ShellRouteTransitionScope.peek(context)?.controller;
    // The page carries its own backdrop, so the covered page never shows
    // through it while it slides.
    final page = AppearanceRouteBackground(
      animation: animation,
      secondaryAnimation: secondaryAnimation,
      child: child,
    );
    final body = reduced
        ? FadeTransition(opacity: animation, child: page)
        : _backFrom != null
        ? _revealBehind(context, animation, page)
        : (transitions?.backArrivalAbove(this) ?? false)
        ? _leaveAsPopped(context, secondaryAnimation, page)
        : _slide(context, animation, secondaryAnimation, page);
    return switch (Theme.of(context).platform) {
      // The edge swipe drives this route's animation with the finger; the
      // Cupertino visuals stay neutral so only [body] moves.
      TargetPlatform.iOS || TargetPlatform.macOS =>
        CupertinoRouteTransitionMixin.buildPageTransitions(
          this,
          context,
          kAlwaysCompleteAnimation,
          kAlwaysDismissedAnimation,
          body,
        ),
      _ => body,
    };
  }

  Widget _slide(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    // A swipe follows the finger linearly.
    final gesture = popGestureInProgress;
    final curve = CurveTween(curve: ShellRouteMotion.emphasized);
    final enter = gesture ? animation : animation.drive(curve);
    final cover = gesture
        ? secondaryAnimation
        : secondaryAnimation.drive(curve);
    final direction = Directionality.of(context);
    return SlideTransition(
      position: cover.drive(
        Tween(
          begin: Offset.zero,
          end: const Offset(-ShellRouteMotion.coveredShift, 0),
        ),
      ),
      textDirection: direction,
      transformHitTests: false,
      child: Stack(
        fit: StackFit.passthrough,
        children: [
          SlideTransition(
            position: enter.drive(
              Tween(begin: const Offset(1, 0), end: Offset.zero),
            ),
            textDirection: direction,
            child: child,
          ),
          Positioned.fill(
            child: IgnorePointer(
              child: FadeTransition(
                key: const ValueKey('shell-route-covered-dim'),
                opacity: cover.drive(
                  Tween(begin: 0, end: ShellRouteMotion.coveredDim),
                ),
                child: ColoredBox(color: Theme.of(context).colorScheme.scrim),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// A Back arrival replaces the page above it, so it plays a pop: this page
  /// shows only where the leaving page has uncovered it, settling from the
  /// covered position.
  Widget _revealBehind(
    BuildContext context,
    Animation<double> animation,
    Widget child,
  ) {
    final covered = MappedAnimation(
      animation,
      (v) => ShellRouteMotion.emphasized.transform(1 - v),
    );
    final direction = Directionality.of(context);
    return ClipRect(
      clipper: _UncoveredClip(
        uncovered: MappedAnimation(covered, (c) => 1 - c),
        direction: direction,
      ),
      child: SlideTransition(
        position: covered.drive(
          Tween(
            begin: Offset.zero,
            end: const Offset(-ShellRouteMotion.coveredShift, 0),
          ),
        ),
        textDirection: direction,
        child: Stack(
          fit: StackFit.passthrough,
          children: [
            child,
            Positioned.fill(
              child: IgnorePointer(
                child: FadeTransition(
                  opacity: covered.drive(
                    Tween(begin: 0, end: ShellRouteMotion.coveredDim),
                  ),
                  child: ColoredBox(color: Theme.of(context).colorScheme.scrim),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// The page a Back arrival replaces slides out towards the end edge.
  Widget _leaveAsPopped(
    BuildContext context,
    Animation<double> secondaryAnimation,
    Widget child,
  ) => SlideTransition(
    position: MappedAnimation(
      secondaryAnimation,
      (v) => 1 - ShellRouteMotion.emphasized.transform(1 - v),
    ).drive(Tween(begin: Offset.zero, end: const Offset(1, 0))),
    textDirection: Directionality.of(context),
    transformHitTests: false,
    child: child,
  );
}

/// Clips to the start-edge fraction of the page that [uncovered] reports.
class _UncoveredClip extends CustomClipper<Rect> {
  _UncoveredClip({required this.uncovered, required this.direction})
    : super(reclip: uncovered);

  final Animation<double> uncovered;
  final TextDirection direction;

  @override
  Rect getClip(Size size) {
    final width = size.width * uncovered.value;
    return direction == TextDirection.rtl
        ? Rect.fromLTRB(size.width - width, 0, size.width, size.height)
        : Rect.fromLTRB(0, 0, width, size.height);
  }

  @override
  bool shouldReclip(_UncoveredClip oldClipper) =>
      oldClipper.uncovered != uncovered || oldClipper.direction != direction;
}
