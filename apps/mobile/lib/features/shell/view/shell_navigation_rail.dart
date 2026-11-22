import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_nav_icon.dart';
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

/// Full-height leading navigation for wide layouts, with Back and the same
/// destinations as the dock.
///
/// The icon rail (landscape tablets) shows each destination's label as a
/// tooltip; the [extended] sidebar (laptops and desktops) shows it beside
/// the icon. Both start at the top, like the web sidebar, and end at a
/// hairline against the page.
class ShellNavigationRail extends StatelessWidget {
  const ShellNavigationRail({
    required this.items,
    required this.selectedKey,
    required this.onSelected,
    this.leading,
    this.extended = false,
    super.key,
  });

  final List<shad.NavigationItem> items;
  final Key? selectedKey;
  final ValueChanged<Key?> onSelected;
  final Widget? leading;
  final bool extended;

  @override
  Widget build(BuildContext context) {
    final style = ShellChromeStyle.of(context);
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final destinations = [
      for (final item in items)
        _RailDestination(
          key: item.key,
          item: item,
          extended: extended,
          selected: item.key == selectedKey,
          onTap: () {
            unawaited(AppHaptics.selection());
            onSelected(item.key);
          },
        ),
    ];
    return DecoratedBox(
      key: const ValueKey('shell-navigation-rail'),
      decoration: BoxDecoration(
        color: AppearanceScope.hasAmbientBackground(context)
            ? Colors.transparent
            : style.page,
        border: BorderDirectional(end: BorderSide(color: style.border)),
      ),
      child: Material(
        type: MaterialType.transparency,
        child: SafeArea(
          right: rtl,
          left: !rtl,
          child: SingleChildScrollView(
            padding: EdgeInsets.symmetric(
              horizontal: extended ? AppSpacing.md : AppSpacing.sm,
              vertical: AppSpacing.md,
            ),
            child: Column(
              crossAxisAlignment: extended
                  ? CrossAxisAlignment.stretch
                  : CrossAxisAlignment.center,
              spacing: AppSpacing.xs,
              children: [
                if (leading case final back?)
                  Align(
                    alignment: extended
                        ? AlignmentDirectional.centerStart
                        : Alignment.center,
                    child: back,
                  ),
                ...destinations,
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RailDestination extends StatelessWidget {
  const _RailDestination({
    required this.item,
    required this.selected,
    required this.extended,
    required this.onTap,
    super.key,
  });

  final shad.NavigationItem item;
  final bool selected;
  final bool extended;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final style = ShellChromeStyle.of(context);
    final tokens = AppTokens.of(context);
    final enabled = item.enabled ?? true;
    final label = shellNavigationItemLabel(item);
    final radius = BorderRadius.circular(
      extended ? style.rowRadius + AppSpacing.xxs : shellNavigationRailSlot / 2,
    );
    final ink = selected ? style.navSelectedInk : style.mutedForeground;
    final glyph = IconTheme.merge(
      data: IconThemeData(size: 22, color: ink),
      child: Opacity(opacity: enabled ? 1 : 0.4, child: item.child),
    );
    final content = extended
        ? Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            child: Row(
              children: [
                SizedBox.square(dimension: 28, child: Center(child: glyph)),
                const SizedBox(width: AppSpacing.md),
                if (label != null)
                  Expanded(
                    // The item already supplies the accessible name.
                    child: ExcludeSemantics(
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: tokens.typography.ui.copyWith(
                          fontSize: 15,
                          color: enabled
                              ? (selected
                                    ? style.navSelectedInk
                                    : style.foreground)
                              : style.mutedForeground,
                          fontWeight: selected
                              ? FontWeight.w600
                              : FontWeight.w500,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          )
        : Center(child: glyph);
    final destination = Semantics(
      selected: selected,
      enabled: enabled,
      child: SizedBox(
        width: extended ? double.infinity : shellNavigationRailSlot,
        height: extended
            ? shellNavigationSidebarRowHeight
            : shellNavigationRailSlot,
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
                  ? style.navSelectedFill
                  : style.navSelectedFill.withValues(alpha: 0),
            ),
            child: content,
          ),
        ),
      ),
    );
    // The sidebar shows the label; the icon rail shows it on hover or long
    // press. The item already supplies the semantics label.
    if (label == null || extended) return destination;
    return Tooltip(
      message: label,
      triggerMode: TooltipTriggerMode.longPress,
      excludeFromSemantics: true,
      preferBelow: false,
      child: destination,
    );
  }
}

/// The localized label a shell destination already carries as its
/// accessible name, reused as the rail's tooltip and the sidebar's label.
String? shellNavigationItemLabel(shad.NavigationItem item) {
  final label = switch (item.child) {
    final ShellDockNavIcon icon => icon.label,
    final Semantics semantics => semantics.properties.label,
    _ => null,
  };
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
  const AdaptiveShellFrame({
    required this.body,
    this.rail,
    this.railExtent = shellNavigationRailExtent,
    super.key,
  });

  final Widget body;
  final Widget? rail;

  /// Width of [rail] before the leading safe area: the icon rail or the
  /// labelled sidebar ([shellNavigationExtentFor]).
  final double railExtent;

  @override
  Widget build(BuildContext context) {
    final rail = this.rail;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final padding = MediaQuery.paddingOf(context);
    final extent = rail == null
        ? 0.0
        : railExtent + (rtl ? padding.right : padding.left);
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
