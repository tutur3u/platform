import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// How the shell presents its primary navigation for the current width.
enum ShellNavigationMode {
  /// Floating bottom dock (phones and portrait tablets).
  dock,

  /// Leading vertical rail (landscape tablets, laptops and desktops).
  rail,
}

/// Picks the shell navigation mode for a window [size].
///
/// The rail needs an expanded width (>= 840dp) on a tablet-or-larger window
/// (shortest side >= 600dp). Phones keep the floating dock in landscape too.
ShellNavigationMode shellNavigationModeFor(Size size) =>
    size.width >= AppLayout.navigationRailMinWidth &&
        size.shortestSide >= Breakpoints.mediumMin
    ? ShellNavigationMode.rail
    : ShellNavigationMode.dock;

/// Horizontal space the rail occupies: slot, 2dp inner padding and 1dp
/// surface border per side, plus the outer margin.
const double shellNavigationRailExtent =
    shellNavigationRailSlot + 2 * 2 + 1 * 2 + AppSpacing.md * 2;

/// Size of one rail destination; matches the dock's 52dp slots.
const double shellNavigationRailSlot = 52;

/// Vertical glass island with the same destinations as the floating dock,
/// including the mini-app Back item, so Back stays reachable on wide layouts.
class ShellNavigationRail extends StatelessWidget {
  const ShellNavigationRail({
    required this.items,
    required this.selectedKey,
    required this.onSelected,
    super.key,
  });

  final List<shad.NavigationItem> items;
  final Key? selectedKey;
  final ValueChanged<Key?> onSelected;

  @override
  Widget build(BuildContext context) => SafeArea(
    right: Directionality.of(context) == TextDirection.rtl,
    left: Directionality.of(context) == TextDirection.ltr,
    child: Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.md,
      ),
      child: Center(
        child: ShellDockSurface(
          key: const ValueKey('shell-navigation-rail'),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(2),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final item in items)
                  _RailDestination(
                    key: item.key,
                    item: item,
                    selected: item.key == selectedKey,
                    onTap: () {
                      unawaited(AppHaptics.selection());
                      onSelected(item.key);
                    },
                  ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class _RailDestination extends StatelessWidget {
  const _RailDestination({
    required this.item,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final shad.NavigationItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final foreground = shad.Theme.of(context).colorScheme.foreground;
    final enabled = item.enabled ?? true;
    final radius = BorderRadius.circular(AppRadius.sheet);
    final label = shellNavigationItemLabel(item);
    final destination = Semantics(
      selected: selected,
      enabled: enabled,
      child: SizedBox.square(
        dimension: shellNavigationRailSlot,
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: radius,
          child: AnimatedContainer(
            duration: MediaQuery.disableAnimationsOf(context)
                ? Duration.zero
                : const Duration(milliseconds: 220),
            curve: Curves.easeInOutCubic,
            decoration: BoxDecoration(
              borderRadius: radius,
              color: selected
                  ? foreground.withValues(alpha: 0.12)
                  : Colors.transparent,
              border: Border.all(
                color: selected
                    ? foreground.withValues(alpha: 0.2)
                    : Colors.transparent,
              ),
            ),
            child: Center(
              child: Opacity(opacity: enabled ? 1 : 0.4, child: item.child),
            ),
          ),
        ),
      ),
    );
    if (label == null) return destination;
    // Hover-only label for pointer devices; touch keeps the bare icon and the
    // item's own semantics label, so the tooltip adds no second announcement.
    return Tooltip(
      message: label,
      triggerMode: TooltipTriggerMode.manual,
      excludeFromSemantics: true,
      preferBelow: false,
      child: destination,
    );
  }
}

/// The localized label a shell destination already carries in its
/// [Semantics] wrapper, reused as the rail's hover tooltip.
String? shellNavigationItemLabel(shad.NavigationItem item) {
  final child = item.child;
  if (child is! Semantics) return null;
  final label = child.properties.label;
  return label == null || label.isEmpty ? null : label;
}

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
  const AdaptiveShellFrame({required this.body, this.rail, super.key});

  final Widget body;
  final Widget? rail;

  @override
  Widget build(BuildContext context) {
    final rail = this.rail;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final padding = MediaQuery.paddingOf(context);
    final extent = rail == null
        ? 0.0
        : shellNavigationRailExtent + (rtl ? padding.right : padding.left);
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
            width: extent,
            child: rail,
          ),
      ],
    );
  }
}
