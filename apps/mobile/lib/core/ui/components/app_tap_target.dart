import 'dart:math' as math;

import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';

/// Minimum interactive size for touch controls (Material and WCAG 2.5.5).
const double kAppMinTapTarget = 48;

/// Pads a control's layout and hit region to at least [minSize] while the
/// child keeps its visual size, centered. Taps anywhere in the padded region
/// reach the child, like Material's `MaterialTapTargetSize.padded`.
class AppTapTarget extends SingleChildRenderObjectWidget {
  const AppTapTarget({
    required Widget super.child,
    this.minSize = const Size.square(kAppMinTapTarget),
    super.key,
  });

  final Size minSize;

  @override
  RenderObject createRenderObject(BuildContext context) =>
      RenderAppTapTarget(minSize);

  @override
  void updateRenderObject(
    BuildContext context,
    RenderAppTapTarget renderObject,
  ) {
    renderObject.minSize = minSize;
  }
}

/// Render object of [AppTapTarget].
class RenderAppTapTarget extends RenderShiftedBox {
  RenderAppTapTarget(this._minSize, [RenderBox? child]) : super(child);

  Size _minSize;
  Size get minSize => _minSize;
  set minSize(Size value) {
    if (_minSize == value) return;
    _minSize = value;
    markNeedsLayout();
  }

  @override
  double computeMinIntrinsicWidth(double height) =>
      math.max(super.computeMinIntrinsicWidth(height), minSize.width);

  @override
  double computeMinIntrinsicHeight(double width) =>
      math.max(super.computeMinIntrinsicHeight(width), minSize.height);

  @override
  double computeMaxIntrinsicWidth(double height) =>
      math.max(super.computeMaxIntrinsicWidth(height), minSize.width);

  @override
  double computeMaxIntrinsicHeight(double width) =>
      math.max(super.computeMaxIntrinsicHeight(width), minSize.height);

  Size _resolve(BoxConstraints constraints, Size childSize) =>
      constraints.constrain(
        Size(
          math.max(childSize.width, minSize.width),
          math.max(childSize.height, minSize.height),
        ),
      );

  @override
  Size computeDryLayout(covariant BoxConstraints constraints) {
    final child = this.child;
    if (child == null) return constraints.constrain(minSize);
    return _resolve(constraints, child.getDryLayout(constraints.loosen()));
  }

  @override
  void performLayout() {
    final child = this.child;
    if (child == null) {
      size = constraints.constrain(minSize);
      return;
    }
    child.layout(constraints.loosen(), parentUsesSize: true);
    size = _resolve(constraints, child.size);
    (child.parentData! as BoxParentData).offset = Alignment.center.alongOffset(
      size - child.size as Offset,
    );
  }

  @override
  bool hitTest(BoxHitTestResult result, {required Offset position}) {
    if (super.hitTest(result, position: position)) return true;
    final child = this.child;
    if (child == null || !size.contains(position)) return false;
    // Redirect padded-area taps to the child's centre.
    final center = child.size.center(Offset.zero);
    return result.addWithRawTransform(
      transform: MatrixUtils.forceToPoint(center),
      position: center,
      hitTest: (result, position) => child.hitTest(result, position: center),
    );
  }
}
