import 'package:flutter/widgets.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/layout/page_insets.dart';

/// A horizontal strip whose content insets scroll with its items. Give the
/// strip the full width of its owning page or panel.
class AppHorizontalScrollView extends StatelessWidget {
  const AppHorizontalScrollView({
    required this.child,
    this.padding = EdgeInsets.zero,
    this.controller,
    this.physics,
    this.pageKind,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final ScrollController? controller;
  final ScrollPhysics? physics;

  /// Adds the standard page gutters inside the scrollable viewport.
  final AppPageKind? pageKind;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final kind = pageKind;
      final insets = kind == null
          ? EdgeInsets.zero
          : AppPageInsets.of(context, width: constraints.maxWidth, kind: kind);
      return AppHorizontalViewport(
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          controller: controller,
          physics: physics,
          clipBehavior: Clip.none,
          padding: padding.add(
            EdgeInsets.only(left: insets.left, right: insets.right),
          ),
          child: child,
        ),
      );
    },
  );
}

/// Clips at the horizontal viewport edges and leaves room for vertical paint
/// overflow from badges, focus outlines and shadows.
class AppHorizontalViewport extends StatelessWidget {
  const AppHorizontalViewport({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) =>
      ClipRect(clipper: const _HorizontalClipper(), child: child);
}

class _HorizontalClipper extends CustomClipper<Rect> {
  const _HorizontalClipper();

  @override
  Rect getClip(Size size) =>
      Rect.fromLTRB(0, -AppSpacing.lg, size.width, size.height + AppSpacing.lg);

  @override
  bool shouldReclip(_HorizontalClipper oldClipper) => false;
}
