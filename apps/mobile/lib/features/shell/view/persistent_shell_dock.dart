import 'package:flutter/material.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/features/shell/view/floating_dock_rail.dart';
import 'package:mobile/features/shell/view/shell_dock_content.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';
import 'package:mobile/features/shell/view/shell_route_fade.dart';

/// The shell retains this state, material and bounds across every destination.
/// Only the current content is interactive: no outgoing composer/nav duplicates.
class PersistentShellDock extends StatefulWidget {
  const PersistentShellDock({
    required this.content,
    this.navigationWidth = 264,
    this.composing = false,
    this.expandContent = true,
    this.hideIdleNavigation = false,
    this.fixedZones = false,
    this.leading,
    this.primary,
    this.showPrimary = true,
    super.key,
  });
  final Widget content;
  final double navigationWidth;
  final bool composing;
  final bool expandContent;

  /// The rail layout owns navigation; an idle dock then paints no surface and
  /// shows only page actions. Composer slots keep the [navigationWidth].
  final bool hideIdleNavigation;

  /// Lays idle navigation out in fixed zones: [leading], the navigation
  /// material filling the available width, and a page-action slot. See
  /// [FloatingDockRail.fixedZones].
  final bool fixedZones;

  /// The Back zone before idle navigation in [fixedZones] mode.
  final Widget? leading;
  final Widget? primary;
  final bool showPrimary;
  @override
  State<PersistentShellDock> createState() => _PersistentShellDockState();
}

class _PersistentShellDockState extends State<PersistentShellDock> {
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final fixedZones =
          widget.fixedZones && !widget.composing && !widget.hideIdleNavigation;
      // Animate the unconstrained navigation/composer width independently.
      // The rail's CURRENT occupied action slot supplies the actual available
      // width below, so removal cannot widen the composer before actions hide.
      final target = fixedZones
          ? ShellDockMetrics.widthFor(
              MediaQuery.sizeOf(context).width,
            ).clamp(0.0, constraints.maxWidth)
          : widget.composing && widget.expandContent
          ? constraints.maxWidth
          : widget.navigationWidth.clamp(0.0, constraints.maxWidth);
      return TweenAnimationBuilder<double>(
        tween: Tween(end: target),
        duration: MediaQuery.disableAnimationsOf(context)
            ? Duration.zero
            : const Duration(milliseconds: 320),
        curve: Curves.easeInOutCubic,
        builder: (context, width, _) {
          final switcher = AnimatedSwitcher(
            duration: MediaQuery.disableAnimationsOf(context)
                ? Duration.zero
                : const Duration(milliseconds: 180),
            // Fade the new slot in without retaining an outgoing dock, input
            // or interactive navigation subtree.
            layoutBuilder: (current, _) => current ?? const SizedBox(),
            child: KeyedSubtree(
              key: ValueKey(widget.composing),
              // A push fades the contents through inside the same material.
              child: ShellRouteFade(child: widget.content),
            ),
          );
          // One material for navigation and composers alike, so it keeps its
          // element (and never flashes) while their content swaps inside it.
          return Center(
            child: SizedBox(
              width: fixedZones ? target : null,
              child: FloatingDockRail(
                fixedZones: fixedZones,
                navigation: widget.hideIdleNavigation && !widget.composing
                    ? const SizedBox.shrink()
                    : LayoutBuilder(
                        builder: (context, available) => ShellDockSurface(
                          key: const ValueKey('persistent-shell-dock-material'),
                          child: SizedBox(
                            width: fixedZones
                                ? available.maxWidth
                                : width.clamp(0.0, available.maxWidth),
                            child: ShellDockContent(
                              leading: fixedZones ? widget.leading : null,
                              child: switcher,
                            ),
                          ),
                        ),
                      ),
                primary: widget.primary,
                showPrimary: widget.showPrimary,
                actionLift: widget.composing || widget.hideIdleNavigation
                    ? 0
                    : ShellDockMetrics.padding,
              ),
            ),
          );
        },
      );
    },
  );
}
