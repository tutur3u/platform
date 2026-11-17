import 'package:flutter/material.dart';

/// One reversible timeline: reserve space, reveal; hide, then release space.
/// Retained outgoing controls cannot receive gestures or accessibility focus.
///
/// With [reserveSpace] the slot keeps its full width while empty and the
/// control only fades and scales inside it, so nothing beside it moves.
class DockActionTransition extends StatefulWidget {
  const DockActionTransition({
    required this.identity,
    required this.slotKey,
    required this.child,
    this.immediate = false,
    this.reserveSpace = false,
    super.key,
  });

  final Object? identity;
  final Key slotKey;
  final Widget? child;
  final bool immediate;
  final bool reserveSpace;

  @override
  State<DockActionTransition> createState() => _DockActionTransitionState();
}

class _DockActionTransitionState extends State<DockActionTransition>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: _duration,
    value: _wanted ? 1 : 0,
  )..addStatusListener(_settled);

  /// A reserved slot only fades, so it needs just the reveal's share of the
  /// timeline; a full hide-and-reveal swap then takes as long as one entry.
  Duration get _duration => widget.reserveSpace
      ? const Duration(milliseconds: 180)
      : const Duration(milliseconds: 360);
  Widget? _displayed;
  Object? _identity;
  bool _replacing = false;
  bool _reduced = false;
  bool get _wanted => widget.child != null;

  /// Timeline value at which the control is fully hidden but its width is
  /// still reserved.
  double get _hiddenAt => widget.reserveSpace ? 0 : .6;

  @override
  void initState() {
    super.initState();
    _displayed = widget.child;
    _identity = widget.identity;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduced = MediaQuery.disableAnimationsOf(context);
    if (_reduced || widget.immediate) _reconcile();
  }

  @override
  void didUpdateWidget(DockActionTransition oldWidget) {
    super.didUpdateWidget(oldWidget);
    _controller.duration = _duration;
    _reconcile();
  }

  void _reconcile() {
    if (_reduced || widget.immediate) {
      _replacing = false;
      _displayed = widget.child;
      _identity = widget.identity;
      _controller.value = _wanted ? 1 : 0;
      return;
    }
    if (_displayed != null &&
        widget.child != null &&
        _identity != widget.identity &&
        _controller.value > _hiddenAt) {
      if (!_replacing) {
        _replacing = true;
        // Replacement needs only hide/reveal, retaining the reserved width.
        _controller.animateBack(_hiddenAt);
      }
      return;
    }
    final wasReplacing = _replacing;
    _replacing = false;
    if (widget.child != null) {
      _displayed = widget.child;
      _identity = widget.identity;
    }
    if (_wanted) {
      if (_controller.status != AnimationStatus.forward &&
          !_controller.isCompleted) {
        _controller.forward();
      }
    } else if (wasReplacing || _controller.status != AnimationStatus.reverse) {
      _controller.reverse();
    }
  }

  void _settled(AnimationStatus status) {
    if (status != AnimationStatus.dismissed || !mounted) return;
    setState(() {
      _displayed = widget.child;
      _identity = widget.identity;
      _replacing = false;
    });
    if (_wanted && !_reduced && !widget.immediate) _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _controller,
    builder: (context, _) {
      final extent = widget.reserveSpace
          ? 1.0
          : const Interval(
              0,
              .6,
              curve: Curves.easeInOutCubic,
            ).transform(_controller.value);
      // A reserved slot has no space to claim first, so the reveal uses the
      // whole timeline.
      final reveal = widget.reserveSpace
          ? Curves.easeOutCubic.transform(_controller.value)
          : const Interval(
              .6,
              1,
              curve: Curves.easeOutCubic,
            ).transform(_controller.value);
      final interactive =
          widget.child != null &&
          !_replacing &&
          _identity == widget.identity &&
          reveal == 1;
      final displayed = _displayed;
      final height = displayed is PreferredSizeWidget
          ? displayed.preferredSize.height
          : 52.0;
      return SizedBox(
        key: extent > 0 && (!widget.reserveSpace || displayed != null)
            ? widget.slotKey
            : null,
        width: 60 * extent,
        height: extent > 0 ? height : 0,
        // The control only paints after full space is reserved. No size clip
        // can cut its scale animation; reverse hides it before space shrinks.
        child: OverflowBox(
          alignment: AlignmentDirectional.bottomEnd,
          minWidth: 60,
          maxWidth: 60,
          minHeight: height,
          maxHeight: height,
          child: Padding(
            padding: const EdgeInsetsDirectional.only(start: 8),
            child: ExcludeSemantics(
              excluding: !interactive,
              child: ExcludeFocus(
                excluding: !interactive,
                child: IgnorePointer(
                  ignoring: !interactive,
                  child: Opacity(
                    opacity: reveal,
                    child: Transform.scale(
                      scale: .85 + .15 * reveal,
                      alignment: Alignment.bottomCenter,
                      child: _displayed,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    },
  );
}
