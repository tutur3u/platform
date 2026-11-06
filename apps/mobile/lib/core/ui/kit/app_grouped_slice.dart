import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Where a row sits within a grouped run of rows.
enum AppSlicePosition {
  only,
  first,
  middle,
  last;

  /// Position of item [index] in a run of [count] rows.
  static AppSlicePosition of(int index, int count) {
    if (count <= 1) return only;
    if (index == 0) return first;
    if (index == count - 1) return last;
    return middle;
  }

  bool get roundsTop => this == only || this == first;
  bool get roundsBottom => this == only || this == last;
}

/// One row's share of a grouped card, for lazy lists.
///
/// `AppGroupedCard` needs every row up front. In a builder list, wrap each
/// row in a slice instead: consecutive slices draw one continuous card with
/// the same fill, hairline outline, radius and inset dividers.
class AppGroupedSlice extends StatelessWidget {
  const AppGroupedSlice({
    required this.position,
    required this.child,
    this.dividerInset = AppLayout.rowDividerInset,
    super.key,
  });

  final AppSlicePosition position;
  final Widget child;
  final double dividerInset;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final solid = MediaQuery.highContrastOf(context);
    final cornerRadius = AppTokens.of(context).interface.radius(AppRadius.card);
    final corner = Radius.circular(cornerRadius);
    final radius = BorderRadius.vertical(
      top: position.roundsTop ? corner : Radius.zero,
      bottom: position.roundsBottom ? corner : Radius.zero,
    );
    return CustomPaint(
      painter: _SlicePainter(
        position: position,
        fill: colors.surface.withValues(alpha: solid ? 1 : 0.72),
        outline: colors.outlineVariant.withValues(alpha: solid ? 1 : 0.4),
        divider: colors.outlineVariant.withValues(alpha: 0.6),
        dividerInset: dividerInset,
        radius: cornerRadius,
        textDirection: Directionality.of(context),
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: Material(type: MaterialType.transparency, child: child),
      ),
    );
  }
}

class _SlicePainter extends CustomPainter {
  const _SlicePainter({
    required this.position,
    required this.fill,
    required this.outline,
    required this.divider,
    required this.dividerInset,
    required this.radius,
    required this.textDirection,
  });

  final AppSlicePosition position;
  final Color fill;
  final Color outline;
  final Color divider;
  final double dividerInset;
  final double radius;
  final TextDirection textDirection;

  @override
  void paint(Canvas canvas, Size size) {
    final r = radius;
    final top = position.roundsTop;
    final bottom = position.roundsBottom;
    final rect = Offset.zero & size;
    canvas.drawRRect(
      RRect.fromRectAndCorners(
        rect,
        topLeft: top ? Radius.circular(r) : Radius.zero,
        topRight: top ? Radius.circular(r) : Radius.zero,
        bottomLeft: bottom ? Radius.circular(r) : Radius.zero,
        bottomRight: bottom ? Radius.circular(r) : Radius.zero,
      ),
      Paint()..color = fill,
    );

    // Outline: the sides always, the top and bottom edges only at the ends
    // of the run. Inset by half a pixel so the stroke stays inside.
    final edge = rect.deflate(0.5);
    final path = Path()..moveTo(edge.left, top ? edge.top + r : edge.top);
    if (top) {
      path
        ..arcToPoint(
          Offset(edge.left + r, edge.top),
          radius: Radius.circular(r),
        )
        ..lineTo(edge.right - r, edge.top)
        ..arcToPoint(
          Offset(edge.right, edge.top + r),
          radius: Radius.circular(r),
        );
    } else {
      path.moveTo(edge.right, edge.top);
    }
    path.lineTo(edge.right, bottom ? edge.bottom - r : edge.bottom);
    if (bottom) {
      path
        ..arcToPoint(
          Offset(edge.right - r, edge.bottom),
          radius: Radius.circular(r),
        )
        ..lineTo(edge.left + r, edge.bottom)
        ..arcToPoint(
          Offset(edge.left, edge.bottom - r),
          radius: Radius.circular(r),
        );
    } else {
      path.moveTo(edge.left, edge.bottom);
    }
    path.lineTo(edge.left, top ? edge.top + r : edge.top);
    canvas.drawPath(
      path,
      Paint()
        ..color = outline
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );

    if (!top) {
      final start = textDirection == TextDirection.ltr ? dividerInset : 0.0;
      final end = textDirection == TextDirection.ltr
          ? size.width
          : size.width - dividerInset;
      canvas.drawLine(
        Offset(start, 0.25),
        Offset(end, 0.25),
        Paint()
          ..color = divider
          ..strokeWidth = 0.5,
      );
    }
  }

  @override
  bool shouldRepaint(_SlicePainter old) =>
      old.position != position ||
      old.fill != fill ||
      old.outline != outline ||
      old.divider != divider ||
      old.dividerInset != dividerInset ||
      old.radius != radius ||
      old.textDirection != textDirection;
}
