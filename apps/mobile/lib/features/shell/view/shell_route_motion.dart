import 'package:flutter/animation.dart';

/// The push/pop timeline shared by the page body, the top bar title and the
/// dock contents.
///
/// Every function takes the route animation value `v` (0 while the incoming
/// page is off screen, 1 once it has settled). A pop runs the same values in
/// reverse and a back-swipe sets them with the finger, so the chrome follows
/// either without its own controller.
abstract final class ShellRouteMotion {
  /// The whole push or pop.
  static const duration = Duration(milliseconds: 220);

  /// Reduced motion: no slide, one linear cross-fade.
  static const reducedDuration = Duration(milliseconds: 100);

  /// Emphasized curve of the page body.
  static const emphasized = Cubic(0.2, 0, 0, 1);

  /// For what leaves.
  static const accelerate = Cubic(0.3, 0, 0.8, 0.15);

  /// For what arrives.
  static const decelerate = Cubic(0.05, 0.7, 0.1, 1);

  /// How far the covered page moves while the new one slides over it.
  static const coveredShift = 0.25;

  /// Peak dimming of the covered page.
  static const coveredDim = 0.12;

  /// Distance the outgoing title travels towards the start edge.
  static const titleExitShift = 12.0;

  /// Distance the incoming title travels from the end edge.
  static const titleEnterShift = 16.0;

  static const double _ms = 220;
  static const double _titleOutEnd = 90 / _ms;
  static const double _titleInStart = 70 / _ms;
  static const double _contentOutEnd = 90 / _ms;
  static const double _contentInStart = 90 / _ms;

  static double _window(double v, double start, double end) =>
      ((v - start) / (end - start)).clamp(0.0, 1.0);

  /// Opacity of the title leaving on push (0-90ms).
  static double titleExitOpacity(double v) =>
      1 - accelerate.transform(_window(v, 0, _titleOutEnd));

  /// Opacity of the title arriving on push (70-220ms).
  static double titleEnterOpacity(double v) =>
      decelerate.transform(_window(v, _titleInStart, 1));

  /// Start-edge offset of the leaving title, in logical pixels.
  static double titleExitOffset(double v) =>
      -titleExitShift * accelerate.transform(_window(v, 0, _titleOutEnd));

  /// End-edge offset of the arriving title, in logical pixels.
  static double titleEnterOffset(double v) =>
      titleEnterShift *
      (1 - decelerate.transform(_window(v, _titleInStart, 1)));

  /// Opacity of dock contents leaving on push (0-90ms).
  static double contentExitOpacity(double v) =>
      1 - accelerate.transform(_window(v, 0, _contentOutEnd));

  /// Opacity of dock contents arriving on push (90-220ms).
  static double contentEnterOpacity(double v) =>
      decelerate.transform(_window(v, _contentInStart, 1));
}

/// An [Animation] whose value is a function of its parent's value. It adds
/// no listeners of its own, so it is cheap to create per transition.
class MappedAnimation extends Animation<double>
    with AnimationWithParentMixin<double> {
  MappedAnimation(this.parent, this.map);

  @override
  final Animation<double> parent;

  final double Function(double value) map;

  @override
  double get value => map(parent.value);
}
