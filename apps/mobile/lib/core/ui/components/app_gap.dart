import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';

/// Fixed space along the parent's main axis.
///
/// Inside a [Row] or [Column] the gap follows the flex direction; inside a
/// scrollable it follows the scroll axis. Elsewhere it is a square. This is a
/// drop-in replacement for `shad.Gap`.
class AppGap extends LeafRenderObjectWidget {
  const AppGap(this.extent, {super.key})
    : assert(extent >= 0, 'A gap cannot be negative.');

  final double extent;

  @override
  RenderObject createRenderObject(BuildContext context) => RenderAppGap(extent);

  @override
  void updateRenderObject(BuildContext context, RenderAppGap renderObject) {
    renderObject.extent = extent;
  }
}

/// Render object of [AppGap].
class RenderAppGap extends RenderBox {
  RenderAppGap(this._extent);

  double _extent;
  double get extent => _extent;
  set extent(double value) {
    if (_extent == value) return;
    _extent = value;
    markNeedsLayout();
  }

  Axis? get _axis => switch (parent) {
    final RenderFlex flex => flex.direction,
    final RenderSliver sliver => sliver.constraints.axis,
    _ => null,
  };

  Size _sizeFor(BoxConstraints constraints) =>
      constraints.constrain(switch (_axis) {
        Axis.horizontal => Size(_extent, 0),
        Axis.vertical => Size(0, _extent),
        null => Size.square(_extent),
      });

  @override
  double computeMinIntrinsicWidth(double height) =>
      _axis == Axis.vertical ? 0 : _extent;

  @override
  double computeMaxIntrinsicWidth(double height) =>
      computeMinIntrinsicWidth(height);

  @override
  double computeMinIntrinsicHeight(double width) =>
      _axis == Axis.horizontal ? 0 : _extent;

  @override
  double computeMaxIntrinsicHeight(double width) =>
      computeMinIntrinsicHeight(width);

  @override
  Size computeDryLayout(covariant BoxConstraints constraints) =>
      _sizeFor(constraints);

  @override
  void performLayout() => size = _sizeFor(constraints);
}
