import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/features/shell/cubit/sidebar_behavior.dart';

const double shellSidebarMinimalExtent = 56;

SidebarBehavior defaultSidebarBehaviorFor(Size size) =>
    shellNavigationExtendedFor(size)
    ? SidebarBehavior.expanded
    : SidebarBehavior.collapsed;

/// How the shell presents its primary navigation for the current width.
enum ShellNavigationMode {
  /// Floating bottom dock (phones, in either orientation).
  dock,

  /// Leading vertical rail (tablets in either orientation, laptops and
  /// desktops).
  rail,
}

/// Picks the shell navigation mode for a window [size].
///
/// The rail needs web's `md` width (>= 768dp) on a tablet-or-larger window
/// (shortest side >= 600dp), so portrait tablets match web. Phones keep the
/// floating dock in landscape too.
ShellNavigationMode shellNavigationModeFor(Size size) =>
    size.width >= AppLayout.navigationRailMinWidth &&
        size.shortestSide >= Breakpoints.mediumMin
    ? ShellNavigationMode.rail
    : ShellNavigationMode.dock;

/// Window width from which the rail extends into a labelled sidebar
/// (13-inch laptops and wider windows).
const double shellSidebarMinWidth = 1280;

/// Width of the icon rail, excluding the leading safe area.
const double shellNavigationRailExtent = 80;

/// Width of the labelled sidebar, excluding the leading safe area.
const double shellNavigationSidebarExtent = 240;

/// Size of one rail destination; matches the dock's 52dp slots.
const double shellNavigationRailSlot = 52;

/// Height of one labelled sidebar destination.
const double shellNavigationSidebarRowHeight = 48;

/// Whether a rail-mode window of [size] shows the labelled sidebar.
bool shellNavigationExtendedFor(Size size) =>
    shellNavigationModeFor(size) == ShellNavigationMode.rail &&
    size.width >= shellSidebarMinWidth;

/// Leading navigation width for a window of [size], excluding the safe
/// area: 0 with the dock, the rail or the sidebar width otherwise.
double shellNavigationExtentFor(Size size) =>
    switch (shellNavigationModeFor(size)) {
      ShellNavigationMode.dock => 0,
      ShellNavigationMode.rail =>
        shellNavigationExtendedFor(size)
            ? shellNavigationSidebarExtent
            : shellNavigationRailExtent,
    };

/// Places [rail] on the leading edge and [body] beside it.
///
/// Both modes build the same tree shape (a [Stack] whose first child holds
/// the body under a stable key), so switching between dock and rail on
/// rotation, resize or immersive toggles never remounts the body, its root
/// tabs or the dock. The rail consumes the leading horizontal safe area, so
/// it is removed from the body's MediaQuery.
///
/// The rail paints after the body: routed pages may contain `BlockSemantics`,
/// which would otherwise drop the semantics of a rail painted before them.
class AdaptiveShellFrame extends StatelessWidget {
  const AdaptiveShellFrame({
    required this.body,
    this.rail,
    this.railExtent = shellNavigationRailExtent,
    this.railPaintExtent,
    super.key,
  });

  final Widget body;
  final Widget? rail;

  /// Width of [rail] before the leading safe area: the icon rail or the
  /// labelled sidebar ([shellNavigationExtentFor]).
  final double railExtent;

  /// Paint width while an overlay covers part of the body.
  final double? railPaintExtent;

  @override
  Widget build(BuildContext context) {
    final rail = this.rail;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final padding = MediaQuery.paddingOf(context);
    final inset = rtl ? padding.right : padding.left;
    final extent = rail == null ? 0.0 : railExtent + inset;
    return Stack(
      fit: StackFit.expand,
      children: [
        Padding(
          key: const ValueKey('adaptive-shell-body'),
          padding: EdgeInsetsDirectional.only(start: extent),
          child: MediaQuery.removePadding(
            context: context,
            removeLeft: rail != null && !rtl,
            removeRight: rail != null && rtl,
            child: body,
          ),
        ),
        if (rail != null)
          PositionedDirectional(
            key: const ValueKey('adaptive-shell-rail'),
            start: 0,
            top: 0,
            bottom: 0,
            width: (railPaintExtent ?? railExtent) + inset,
            child: rail,
          ),
      ],
    );
  }
}
