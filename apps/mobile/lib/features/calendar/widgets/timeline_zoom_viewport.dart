import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:mobile/features/calendar/utils/timeline_zoom.dart';

/// Observes multi-touch without competing with single-pointer scroll gestures.
/// Only the timeline's own scroll activities are held during a pinch.
class TimelineZoomViewport extends StatefulWidget {
  const TimelineZoomViewport({
    required this.zoom,
    required this.baseHourHeight,
    required this.verticalController,
    required this.viewportKey,
    required this.builder,
    super.key,
    this.horizontalControllers = const [],
    this.onZoomEnd,
    this.scope,
  });

  final double zoom;
  final Object? scope;
  final double baseHourHeight;
  final ScrollController verticalController;
  final List<ScrollController> horizontalControllers;
  final GlobalKey viewportKey;
  final ValueChanged<double>? onZoomEnd;
  final Widget Function(BuildContext, double, bool Function()) builder;

  @override
  State<TimelineZoomViewport> createState() => _TimelineZoomViewportState();
}

class _TimelineZoomViewportState extends State<TimelineZoomViewport>
    with SingleTickerProviderStateMixin {
  final _pointers = <int, Offset>{};
  final _holds = <ScrollHoldController>[];
  late double _zoom;
  late final AnimationController _animation;
  double _startZoom = 1;
  double _startSpan = 1;
  double _anchorHours = 0;
  double _focalY = 0;
  double _animationStart = 1;
  double _animationEnd = 1;
  bool _pinching = false;
  bool _suppressed = false;
  int _generation = 0;
  int _layoutRevision = 0;

  @override
  void initState() {
    super.initState();
    _zoom = calendarTimelineZoom(widget.zoom);
    _animation =
        AnimationController(
          vsync: this,
          duration: const Duration(milliseconds: 180),
        )..addListener(() {
          _applyZoom(
            _animationStart +
                (_animationEnd - _animationStart) *
                    Curves.easeOut.transform(_animation.value),
          );
        });
  }

  RenderBox? get _viewport {
    final object = widget.viewportKey.currentContext?.findRenderObject();
    return object is RenderBox && object.hasSize ? object : null;
  }

  List<ScrollController> get _controllers => [
    widget.verticalController,
    ...widget.horizontalControllers,
  ];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context) && _animation.isAnimating) {
      _animation.stop();
      _applyZoom(_animationEnd);
    }
  }

  @override
  void didUpdateWidget(TimelineZoomViewport oldWidget) {
    super.didUpdateWidget(oldWidget);
    final target = calendarTimelineZoom(widget.zoom);
    if (oldWidget.scope != widget.scope) {
      _generation++;
      _layoutRevision++;
      _animation.stop();
      _pointers.clear();
      _pinching = false;
      // Keep guards active while cancelling a previous scope's scroll activity.
      _suppressed = true;
      for (final hold in _holds) {
        hold.cancel();
      }
      _holds.clear();
      _zoom = target;
      final generation = _generation;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && generation == _generation) _suppressed = false;
      });
      return;
    }
    if (!_pinching && target != _zoom && oldWidget.zoom != widget.zoom) {
      _captureAnchor((_viewport?.size.height ?? 0) / 2);
      _animationStart = _zoom;
      _animationEnd = target;
      if (MediaQuery.disableAnimationsOf(context)) {
        _animation.stop();
        _applyZoom(target);
      } else {
        _animation.forward(from: 0);
      }
    }
  }

  void _captureAnchor(double focalY) {
    _focalY = focalY;
    final offset = widget.verticalController.hasClients
        ? widget.verticalController.offset
        : 0.0;
    _anchorHours = (offset + focalY) / (widget.baseHourHeight * _zoom);
  }

  Offset get _center =>
      _pointers.values.reduce((a, b) => a + b) / _pointers.length.toDouble();

  double get _span {
    final center = _center;
    return _pointers.values.fold<double>(
          0,
          (sum, point) => sum + (point - center).distance,
        ) /
        _pointers.length;
  }

  void _holdScrolls() {
    for (final hold in _holds) {
      hold.cancel();
    }
    _holds.clear();
    for (final controller in _controllers) {
      if (controller.hasClients) {
        _holds.add(controller.position.hold(() {}));
      }
    }
  }

  void _down(PointerDownEvent event) {
    if (event.kind != PointerDeviceKind.touch) return;
    final box = _viewport;
    if (box == null || !box.size.contains(box.globalToLocal(event.position))) {
      return;
    }
    _pointers[event.pointer] = event.position;
    if (_pointers.length < 2) return;
    _generation++;
    _animation.stop();
    _pinching = true;
    _suppressed = true;
    _holdScrolls();
    _startSpan = math.max(1, _span);
    _startZoom = _zoom;
    _captureAnchor(box.globalToLocal(_center).dy);
  }

  void _move(PointerMoveEvent event) {
    if (!_pointers.containsKey(event.pointer)) return;
    _pointers[event.pointer] = event.position;
    if (!_pinching || _pointers.length < 2) return;
    // A recognizer that had not won when the second pointer arrived may begin
    // its drag later. Cancel only this timeline's competing scroll activity.
    _holdScrolls();
    _focalY = _viewport?.globalToLocal(_center).dy ?? _focalY;
    _applyZoom(calendarTimelineZoom(_startZoom * _span / _startSpan));
  }

  void _applyZoom(double value) {
    if (!mounted) return;
    setState(() => _zoom = value);
    final revision = ++_layoutRevision;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || revision != _layoutRevision) return;
      final controller = widget.verticalController;
      if (!controller.hasClients) return;
      controller.jumpTo(
        calendarZoomOffset(
          anchorHours: _anchorHours,
          hourHeight: widget.baseHourHeight * _zoom,
          focalY: _focalY,
          maxExtent: controller.position.maxScrollExtent,
        ),
      );
    });
  }

  void _up(PointerEvent event) {
    if (_pointers.remove(event.pointer) == null || !_pinching) return;
    // Preserve suppression until every contact and its queued recognizer
    // callbacks have finished, including the final PointerUp.
    if (_pointers.length >= 2) {
      _startSpan = math.max(1, _span);
      _startZoom = _zoom;
      _captureAnchor(_viewport?.globalToLocal(_center).dy ?? _focalY);
      return;
    }
    if (_pointers.isNotEmpty) return;
    _pinching = false;
    final generation = _generation;
    final completedZoom = _zoom;
    for (final hold in _holds) {
      hold.cancel();
    }
    _holds.clear();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || generation != _generation || _pointers.isNotEmpty) return;
      _suppressed = false;
      widget.onZoomEnd?.call(completedZoom);
    });
  }

  @override
  void dispose() {
    _generation++;
    _layoutRevision++;
    _animation.dispose();
    for (final hold in _holds) {
      hold.cancel();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Listener(
    onPointerDown: _down,
    onPointerMove: _move,
    onPointerUp: _up,
    onPointerCancel: _up,
    child: widget.builder(context, _zoom, () => _suppressed),
  );
}
