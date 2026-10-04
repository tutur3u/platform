import 'package:flutter/material.dart';
import 'package:mobile/features/shell/view/floating_dock_rail.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';

/// The shell retains this state, material and bounds across every destination.
/// Only the current content is interactive: no outgoing composer/nav duplicates.
class PersistentShellDock extends StatefulWidget {
  const PersistentShellDock({
    required this.content,
    this.navigationWidth = 264,
    this.composing = false,
    this.primary,
    this.secondary,
    super.key,
  });
  final Widget content;
  final double navigationWidth;
  final bool composing;
  final Widget? primary;
  final Widget? secondary;
  @override
  State<PersistentShellDock> createState() => _PersistentShellDockState();
}

class _PersistentShellDockState extends State<PersistentShellDock> {
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final actions = widget.primary == null
          ? 0
          : widget.secondary != null && constraints.maxWidth >= 376
          ? 120
          : 60;
      final available = (constraints.maxWidth - actions).clamp(
        0.0,
        double.infinity,
      );
      final target = widget.composing
          ? available
          : widget.navigationWidth.clamp(0.0, available);
      return TweenAnimationBuilder<double>(
        tween: Tween(end: target),
        duration: MediaQuery.disableAnimationsOf(context)
            ? Duration.zero
            : const Duration(milliseconds: 320),
        curve: Curves.easeInOutCubic,
        builder: (context, width, _) => FloatingDockRail(
          navigation: ShellDockSurface(
            key: const ValueKey('persistent-shell-dock-material'),
            child: SizedBox(
              width: width,
              child: AnimatedSwitcher(
                duration: MediaQuery.disableAnimationsOf(context)
                    ? Duration.zero
                    : const Duration(milliseconds: 180),
                // Fade the new slot in without retaining an outgoing dock,
                // input or interactive navigation subtree.
                layoutBuilder: (current, _) => current ?? const SizedBox(),
                child: KeyedSubtree(
                  key: ValueKey(widget.composing),
                  child: widget.content,
                ),
              ),
            ),
          ),
          primary: widget.primary,
          secondary: widget.secondary,
        ),
      );
    },
  );
}
