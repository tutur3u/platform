import 'package:flutter/rendering.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';
import 'package:mobile/features/shell/view/shell_route_motion.dart';
import 'package:mobile/features/shell/view/shell_route_transition.dart';

/// What a [ShellRouteFade] holds, which picks its slice of the timeline.
enum ShellRouteFadeKind {
  /// The top bar title: fades with a short slide.
  title,

  /// Dock contents: fade through in place.
  content,
}

/// Runs shell chrome on the route transition's timeline: the content of the
/// location being left stays as a non-interactive layer that fades out while
/// the current content fades in. Only opacity and paint offset follow the
/// route animation, so a frame never rebuilds either subtree, and a
/// back-swipe scrubs both with the finger.
///
/// The tree has the same shape with or without a transition, so the current
/// content keeps its element and state.
///
/// When the previous and current content have the same non-null [identity],
/// they show the same thing: the content stays fully visible and nothing
/// fades.
class ShellRouteFade extends StatefulWidget {
  const ShellRouteFade({
    required this.child,
    this.kind = ShellRouteFadeKind.content,
    this.alignment = AlignmentDirectional.center,
    this.identity,
    super.key,
  });

  final Widget child;
  final ShellRouteFadeKind kind;
  final AlignmentGeometry alignment;

  /// What [child] shows, as a value; null always fades.
  final Object? identity;

  @override
  State<ShellRouteFade> createState() => _ShellRouteFadeState();
}

class _ShellRouteFadeState extends State<ShellRouteFade>
    with _ShellRouteRetention<ShellRouteFade> {
  @override
  ShellRouteFadeKind get kind => widget.kind;

  @override
  Widget build(BuildContext context) {
    current = widget.child;
    currentIdentity = widget.identity;
    final same = continuous;
    final retained = same ? null : ghost;
    return Stack(
      alignment: widget.alignment,
      fit: StackFit.passthrough,
      children: [
        if (retained == null)
          const SizedBox.shrink()
        else
          IgnorePointer(
            child: ExcludeSemantics(
              child: ExcludeFocus(
                child: _layer(retained, ghostOpacity, ghostOffset),
              ),
            ),
          ),
        _layer(
          widget.child,
          same ? kAlwaysCompleteAnimation : liveOpacity,
          same ? kAlwaysDismissedAnimation : liveOffset,
        ),
      ],
    );
  }

  Widget _layer(
    Widget child,
    Animation<double> opacity,
    Animation<double> offset,
  ) => FadeTransition(
    opacity: opacity,
    child: _RouteShift(
      offset: offset,
      child: RepaintBoundary(child: child),
    ),
  );
}

/// The dock's action circle. The circle keeps its material while only its
/// icon fades through to the next location's action; see
/// [ShellRouteIconFade]. The same action on both sides does not fade. A
/// control without a known icon swaps through the slot's own hide and
/// reveal, fading the whole circle.
class ShellRoutePrimaryFade extends StatefulWidget {
  const ShellRoutePrimaryFade({
    required this.primary,
    required this.iconOf,
    required this.builder,
    super.key,
  });

  final Widget? primary;

  /// The icon a primary control shows, if it has one.
  final IconData? Function(Widget primary) iconOf;

  /// Builds the slot. `swap` is true while the circle passes from one
  /// action straight to the next, which must not hide the circle.
  final Widget Function(
    BuildContext context,
    Widget? primary, {
    required bool swap,
  })
  builder;

  @override
  State<ShellRoutePrimaryFade> createState() => _ShellRoutePrimaryFadeState();
}

class _ShellRoutePrimaryFadeState extends State<ShellRoutePrimaryFade>
    with _ShellRouteRetention<ShellRoutePrimaryFade> {
  @override
  ShellRouteFadeKind get kind => ShellRouteFadeKind.content;

  @override
  Widget build(BuildContext context) {
    current = widget.primary;
    final retained = ghost;
    final primary = widget.primary;
    final ghostIcon = retained == null ? null : widget.iconOf(retained);
    final liveIcon = primary == null ? null : widget.iconOf(primary);
    final same = retained?.key == primary?.key && ghostIcon == liveIcon;
    // Only two icon controls can share the circle; any other pair keeps the
    // slot's own hide and reveal, which fades the whole circle.
    final swap = ghostIcon != null && liveIcon != null && !same;
    return ShellRouteIconFade(
      live: swap ? liveOpacity : kAlwaysCompleteAnimation,
      ghost: ghostOpacity,
      ghostIcon: swap ? ghostIcon : null,
      child: widget.builder(context, primary, swap: swap),
    );
  }
}

/// Lets a dock control fade its icon on the route timeline while its
/// material stays put.
class ShellRouteIconFade extends InheritedWidget {
  const ShellRouteIconFade({
    required this.live,
    required this.ghost,
    required super.child,
    this.ghostIcon,
    super.key,
  });

  /// Opacity of the control's own icon.
  final Animation<double> live;

  /// Opacity of [ghostIcon], the previous location's icon.
  final Animation<double> ghost;
  final IconData? ghostIcon;

  static ShellRouteIconFade? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<ShellRouteIconFade>();

  @override
  bool updateShouldNotify(ShellRouteIconFade oldWidget) =>
      live != oldWidget.live ||
      ghost != oldWidget.ghost ||
      ghostIcon != oldWidget.ghostIcon;
}

/// Retains the previous location's child and points the live and retained
/// layers at the route timeline.
mixin _ShellRouteRetention<W extends StatefulWidget> on State<W> {
  ShellRouteFadeKind get kind;

  final liveOpacity = ProxyAnimation(kAlwaysCompleteAnimation);
  final ghostOpacity = ProxyAnimation(kAlwaysDismissedAnimation);
  final liveOffset = ProxyAnimation(kAlwaysDismissedAnimation);
  final ghostOffset = ProxyAnimation(kAlwaysDismissedAnimation);

  /// The child built for the current location; set on each build.
  Widget? current;

  /// The value identity of [current], when it has one; set on each build.
  Object? currentIdentity;
  Object? _retainedIdentity;

  /// Whether the retained and current children show the same thing.
  bool get continuous =>
      currentIdentity != null && currentIdentity == _retainedIdentity;

  ShellRouteTransitionController? _controller;
  bool Function(String from, String to)? _animates;
  String? _location;
  String? _retainedLocation;
  Widget? _retained;
  bool _showRetained = false;
  bool _settleScheduled = false;

  /// Frames the retained layer still waits for a transition after a
  /// location change. A pushed route shows from its second frame, so the
  /// chrome holds the starting state until then instead of flashing the
  /// next location's content.
  int _pendingFrames = 0;

  /// The previous location's child while it is on screen.
  Widget? get ghost => _showRetained ? _retained : null;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final scope = ShellRouteTransitionScope.maybeOf(context);
    final controller = scope?.controller;
    if (!identical(controller, _controller)) {
      _controller?.removeListener(_onTransition);
      _controller = controller?..addListener(_onTransition);
    }
    _animates = scope?.animates;
    final location = scope == null
        ? null
        : normalizeShellRouteLocation(scope.location);
    final previous = _location;
    if (location != previous) {
      _location = location;
      if (previous != null && location != null) {
        _retained = current;
        _retainedIdentity = currentIdentity;
        _retainedLocation = previous;
        _showRetained =
            _retained != null && scope!.animates(previous, location);
        _pendingFrames = _showRetained ? 2 : 0;
        if (_showRetained) _scheduleSettle();
      }
    }
    _retarget();
  }

  @override
  void dispose() {
    _controller?.removeListener(_onTransition);
    super.dispose();
  }

  bool get _engaged {
    final controller = _controller;
    final top = controller?.topLocation;
    final location = _location;
    final retainedLocation = _retainedLocation;
    if (controller == null || !controller.active || top == null) return false;
    if (location == null || retainedLocation == null || _retained == null) {
      return false;
    }
    final animates = _animates ?? (_, _) => true;
    // While the current location's route is on top (a push, or a swipe
    // before it commits), the retained layer must be the page under it.
    if (top == location) {
      return controller.belowLocation == retainedLocation &&
          animates(retainedLocation, location);
    }
    return top == retainedLocation && animates(retainedLocation, location);
  }

  void _onTransition() {
    _retarget();
    if (_engaged) {
      // A swipe or pop starts without a location change; at its first frame
      // the retained layer is still fully transparent, so it can join one
      // frame later.
      if (!_showRetained) {
        SchedulerBinding.instance.addPostFrameCallback((_) {
          if (mounted && !_showRetained && _engaged) {
            setState(() => _showRetained = true);
          }
        });
      }
    } else if (_showRetained) {
      _scheduleSettle();
    }
  }

  /// Drops the retained layer once no transition needs it.
  void _scheduleSettle() {
    if (_settleScheduled) return;
    _settleScheduled = true;
    void settle() {
      _settleScheduled = false;
      if (!mounted || !_showRetained || _engaged) return;
      if (_pendingFrames > 0) {
        _pendingFrames--;
        _scheduleSettle();
        SchedulerBinding.instance.scheduleFrame();
        return;
      }
      _retarget();
      setState(() => _showRetained = false);
    }

    final phase = SchedulerBinding.instance.schedulerPhase;
    if (_pendingFrames == 0 &&
        (phase == SchedulerPhase.idle ||
            phase == SchedulerPhase.transientCallbacks)) {
      settle();
    } else {
      SchedulerBinding.instance.addPostFrameCallback((_) => settle());
    }
  }

  void _retarget() {
    final controller = _controller;
    final engaged = _engaged;
    if (engaged) _pendingFrames = 0;
    if (_pendingFrames > 0 && _showRetained) {
      // Waiting for the route: hold the start of the timeline.
      liveOpacity.parent = kAlwaysDismissedAnimation;
      ghostOpacity.parent = kAlwaysCompleteAnimation;
      liveOffset.parent = kAlwaysDismissedAnimation;
      ghostOffset.parent = kAlwaysDismissedAnimation;
      return;
    }
    if (controller == null || !engaged) {
      liveOpacity.parent = kAlwaysCompleteAnimation;
      ghostOpacity.parent = kAlwaysDismissedAnimation;
      liveOffset.parent = kAlwaysDismissedAnimation;
      ghostOffset.parent = kAlwaysDismissedAnimation;
      return;
    }
    final v = controller.animation;
    final liveIsTop = controller.topLocation == _location;
    Animation<double> map(double Function(double) f) => MappedAnimation(v, f);
    const still = kAlwaysDismissedAnimation;
    final (enter, exit, enterOffset, exitOffset) = controller.reduced
        ? (v, map((value) => 1 - value), still, still)
        : kind == ShellRouteFadeKind.title
        ? (
            map(ShellRouteMotion.titleEnterOpacity),
            map(ShellRouteMotion.titleExitOpacity),
            map(ShellRouteMotion.titleEnterOffset),
            map(ShellRouteMotion.titleExitOffset),
          )
        : (
            map(ShellRouteMotion.contentEnterOpacity),
            map(ShellRouteMotion.contentExitOpacity),
            still,
            still,
          );
    liveOpacity.parent = liveIsTop ? enter : exit;
    ghostOpacity.parent = liveIsTop ? exit : enter;
    liveOffset.parent = liveIsTop ? enterOffset : exitOffset;
    ghostOffset.parent = liveIsTop ? exitOffset : enterOffset;
  }
}

/// Moves its child horizontally by [offset] logical pixels (mirrored in
/// right-to-left text) at paint time, with hit testing to match.
class _RouteShift extends SingleChildRenderObjectWidget {
  const _RouteShift({required this.offset, super.child});

  final Animation<double> offset;

  @override
  RenderObject createRenderObject(BuildContext context) => _RenderRouteShift(
    offset: offset,
    textDirection: Directionality.of(context),
  );

  @override
  void updateRenderObject(
    BuildContext context,
    _RenderRouteShift renderObject,
  ) {
    renderObject
      ..offset = offset
      ..textDirection = Directionality.of(context);
  }
}

class _RenderRouteShift extends RenderProxyBox {
  _RenderRouteShift({
    required Animation<double> offset,
    required TextDirection textDirection,
  }) : _offset = offset,
       _textDirection = textDirection;

  Animation<double> _offset;
  Animation<double> get offset => _offset;
  set offset(Animation<double> value) {
    if (identical(value, _offset)) return;
    if (attached) _offset.removeListener(markNeedsPaint);
    _offset = value;
    if (attached) _offset.addListener(markNeedsPaint);
    markNeedsPaint();
  }

  TextDirection _textDirection;
  TextDirection get textDirection => _textDirection;
  set textDirection(TextDirection value) {
    if (value == _textDirection) return;
    _textDirection = value;
    markNeedsPaint();
  }

  Offset get _shift => Offset(
    _textDirection == TextDirection.rtl ? -_offset.value : _offset.value,
    0,
  );

  @override
  void attach(PipelineOwner owner) {
    super.attach(owner);
    _offset.addListener(markNeedsPaint);
  }

  @override
  void detach() {
    _offset.removeListener(markNeedsPaint);
    super.detach();
  }

  @override
  void paint(PaintingContext context, Offset offset) {
    final child = this.child;
    if (child != null) context.paintChild(child, offset + _shift);
  }

  @override
  bool hitTestChildren(BoxHitTestResult result, {required Offset position}) {
    final child = this.child;
    if (child == null) return false;
    return result.addWithPaintOffset(
      offset: _shift,
      position: position,
      hitTest: (result, transformed) =>
          child.hitTest(result, position: transformed),
    );
  }

  @override
  void applyPaintTransform(RenderBox child, Matrix4 transform) {
    final shift = _shift;
    transform.translateByDouble(shift.dx, shift.dy, 0, 1);
  }
}
