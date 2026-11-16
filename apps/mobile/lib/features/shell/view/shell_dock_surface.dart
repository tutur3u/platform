import 'package:flutter/material.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';

/// Shared material of the floating dock, the navigation rail and the dock's
/// composers: a solid `roles.dockSurface` pill with the floating shadow and
/// an edge hairline (a plain outline in classic). `mobile.dockBlur` is 0, so
/// nothing behind it is blurred.
class ShellDockSurface extends StatelessWidget {
  const ShellDockSurface({required this.child, super.key});
  final Widget child;

  /// Fully rounded at the dock's height; taller content keeps the same
  /// corners rather than turning into a stadium.
  static const double radius = ShellDockMetrics.height / 2;

  /// Width of the edge, which insets the content on every side.
  static const double edge = 1;

  @override
  Widget build(BuildContext context) {
    final style = ShellChromeStyle.of(context);
    final shape = BorderRadius.circular(radius);
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: shape,
        boxShadow: style.floatingShadow,
      ),
      child: ClipRRect(
        borderRadius: shape,
        child: Container(
          decoration: BoxDecoration(
            color: style.dockSurface,
            borderRadius: shape,
            border: Border.all(color: style.floatingOutline),
          ),
          child: Material(color: Colors.transparent, child: child),
        ),
      ),
    );
  }
}

/// Fades content into the page behind the dock: transparent at the top,
/// 55% of [color] from [ShellDockMetrics.dockFadeHeight] down.
class ShellDockFade extends StatelessWidget {
  const ShellDockFade({required this.color, super.key});
  final Color color;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final height = constraints.maxHeight;
      final stop = height <= 0
          ? 0.0
          : (ShellDockMetrics.dockFadeHeight / height).clamp(0.0, 1.0);
      final veil = color.withValues(alpha: 0.55);
      return DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [color.withValues(alpha: 0), veil, veil],
            stops: [0, stop, 1],
          ),
        ),
      );
    },
  );
}
