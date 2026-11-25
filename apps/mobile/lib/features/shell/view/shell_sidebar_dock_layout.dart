import 'package:flutter/material.dart';

class ShellResponsiveDock extends StatelessWidget {
  const ShellResponsiveDock({
    required this.compact,
    required this.compactHeight,
    required this.child,
    super.key,
  });

  final bool compact;
  final double compactHeight;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (compact) {
      final growth = (MediaQuery.textScalerOf(context).scale(10) - 10).clamp(
        0,
        double.infinity,
      );
      return SizedBox(
        width: double.infinity,
        height: compactHeight + growth * 1.6,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: child,
          ),
        ),
      );
    }

    final maxWidth = MediaQuery.sizeOf(context).width - 24;
    return SizedBox(
      child: Center(
        widthFactor: 1,
        heightFactor: 1,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth > 0 ? maxWidth : 0),
          // The dock owns the glass and outline.
          child: Padding(padding: EdgeInsets.zero, child: child),
        ),
      ),
    );
  }
}

class ShellCompactFooter extends StatelessWidget {
  const ShellCompactFooter({
    required this.background,
    required this.child,
    super.key,
  });

  final Color background;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.viewPaddingOf(context).bottom;
    return Container(
      key: const ValueKey('compact-shell-footer'),
      color: background,
      padding: EdgeInsets.only(
        bottom: inset <= 0 ? 0 : (inset * 0.42).clamp(10.0, 16.0),
      ),
      child: child,
    );
  }
}

class ShellLayeredDock extends StatelessWidget {
  const ShellLayeredDock({
    required this.compact,
    required this.compactHeight,
    required this.onHorizontalDragEnd,
    required this.child,
    super.key,
  });

  final bool compact;
  final double compactHeight;
  final ValueChanged<DragEndDetails> onHorizontalDragEnd;
  final Widget child;

  @override
  Widget build(BuildContext context) => ShellResponsiveDock(
    compact: compact,
    compactHeight: compactHeight,
    child: GestureDetector(
      behavior: HitTestBehavior.translucent,
      onHorizontalDragEnd: onHorizontalDragEnd,
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 180),
        switchInCurve: Curves.easeOutCubic,
        switchOutCurve: Curves.easeInCubic,
        child: child,
      ),
    ),
  );
}

class ShellLayeredPages extends StatelessWidget {
  const ShellLayeredPages({
    required this.controller,
    required this.onPageChanged,
    required this.globalBody,
    required this.miniBody,
    super.key,
  });

  final PageController controller;
  final ValueChanged<int> onPageChanged;
  final Widget globalBody;
  final Widget miniBody;

  @override
  Widget build(BuildContext context) => PageView(
    controller: controller,
    physics: const NeverScrollableScrollPhysics(),
    onPageChanged: onPageChanged,
    children: [globalBody, miniBody],
  );
}
