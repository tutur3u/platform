import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/ui/components/app_tooltip.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/shell/view/custom_navigation_bar.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_nav_icon.dart';
import 'package:mobile/features/shell/view/shell_rail_sections.dart';
import 'package:mobile/features/shell/view/shell_sidebar_account.dart';
import 'package:mobile/features/shell/view/shell_sidebar_brand.dart';
import 'package:mobile/features/shell/view/shell_sidebar_dock_layout.dart';
import 'package:mobile/features/shell/view/shell_sidebar_frame.dart';
import 'package:mobile/features/shell/view/shell_sidebar_geometry.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

export 'package:mobile/features/shell/view/shell_sidebar_account.dart';
export 'package:mobile/features/shell/view/shell_sidebar_body.dart';
export 'package:mobile/features/shell/view/shell_sidebar_destination_title.dart';
export 'package:mobile/features/shell/view/shell_sidebar_dock_layout.dart';
export 'package:mobile/features/shell/view/shell_sidebar_geometry.dart';

/// Full-height leading navigation for wide layouts, with Back and a
/// persistent brand header and account footer.
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
    this.footer,
    this.leading,
    this.modeMenu,
    this.onBrandTap,
    this.extended = false,
    super.key,
  });

  final List<shad.NavigationItem> items;
  final Key? selectedKey;
  final ValueChanged<Key?> onSelected;
  final Widget? footer;
  final Widget? leading;
  final Widget? modeMenu;
  final VoidCallback? onBrandTap;
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
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: extended ? AppSpacing.md : AppSpacing.sm,
              vertical: AppSpacing.md,
            ),
            child: FocusTraversalGroup(
              child: Column(
                spacing: AppSpacing.sm,
                children: [
                  if (onBrandTap case final reveal?)
                    AppTooltip(
                      message: context.l10n.appearanceSidebarOpen,
                      child: InkWell(
                        onTap: reveal,
                        child: ShellSidebarBrand(extended: extended),
                      ),
                    )
                  else
                    ShellSidebarBrand(extended: extended),
                  Expanded(
                    child: SingleChildScrollView(
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
                  if (modeMenu case final menu?) menu,
                  if (footer case final account?) account,
                ],
              ),
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
    final icon = switch (item.child) {
      final ShellDockNavIcon glyph => glyph,
      _ => null,
    };
    if (icon != null && icon.heading) {
      return ShellRailSectionHeading(
        label: icon.label,
        expanded: icon.expanded,
        count: icon.count,
        extended: extended,
        onTap: enabled ? onTap : null,
      );
    }
    final count = icon?.count;
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
                // A dropdown glyph carries its chevron beside the icon.
                ConstrainedBox(
                  constraints: const BoxConstraints(
                    minWidth: 28,
                    minHeight: 28,
                    maxHeight: 28,
                  ),
                  child: Center(widthFactor: 1, child: glyph),
                ),
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
                if (count != null && count > 0) ShellRailCount(count: count),
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
    return AppTooltip(
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

class ShellSidebarScaffold extends StatelessWidget {
  const ShellSidebarScaffold({
    required this.location,
    required this.showSidebar,
    required this.includeWorkspacePicker,
    required this.items,
    required this.selectedKey,
    required this.onSelected,
    required this.onProfileSelected,
    required this.body,
    this.compactFooter,
    this.back,
    super.key,
  });

  final String location;
  final bool showSidebar;
  final bool includeWorkspacePicker;
  final List<shad.NavigationItem> items;
  final Key? selectedKey;
  final ValueChanged<Key?> onSelected;
  final VoidCallback onProfileSelected;
  final Widget body;
  final Widget? compactFooter;
  final ShellDockBackZone? back;

  @override
  Widget build(BuildContext context) => shad.Scaffold(
    footers: [if (compactFooter case final footer?) footer],
    child: ShellSidebarFrame(
      location: location,
      railBuilder: showSidebar ? _buildRail : null,
      body: body,
    ),
  );

  Widget _buildRail(
    bool extended,
    Widget modeMenu,
    VoidCallback dismiss, {
    VoidCallback? onBrandTap,
  }) {
    final back = this.back;
    return ShellNavigationRail(
      leading: back == null
          ? null
          : ShellDockBackZone(
              back: back.back,
              onTap: () {
                dismiss();
                back.onTap();
              },
              onLongPress: () {
                dismiss();
                back.onLongPress?.call();
              },
            ),
      modeMenu: modeMenu,
      onBrandTap: onBrandTap,
      items: items,
      selectedKey: selectedKey,
      onSelected: (key) {
        dismiss();
        onSelected(key);
      },
      extended: extended,
      footer: ShellSidebarAccount(
        extended: extended,
        matchedLocation: location,
        includeWorkspacePicker: includeWorkspacePicker,
        onProfileSelected: () {
          dismiss();
          onProfileSelected();
        },
      ),
    );
  }
}

class ShellLayeredNavigation extends StatelessWidget {
  const ShellLayeredNavigation({
    required this.compact,
    required this.mini,
    required this.navKey,
    required this.selected,
    required this.destinations,
    required this.onSelected,
    required this.minItemWidth,
    required this.miniBackWidth,
    required this.compactHeight,
    required this.onHorizontalDragEnd,
    required this.wrapGlobal,
    super.key,
  });

  final bool compact;
  final bool mini;
  final Key navKey;
  final Key? selected;
  final List<shad.NavigationItem> destinations;
  final ValueChanged<Key?> onSelected;
  final double minItemWidth;
  final double miniBackWidth;
  final double compactHeight;
  final ValueChanged<DragEndDetails> onHorizontalDragEnd;
  final Widget Function(BuildContext, Widget) wrapGlobal;

  @override
  Widget build(BuildContext context) {
    final navigation = compact
        ? shad.NavigationBar(
            key: navKey,
            selectedKey: selected,
            padding: EdgeInsets.symmetric(
              horizontal: mini ? 4 : 8,
              vertical: 4,
            ),
            onSelected: onSelected,
            children: [
              for (final (index, item) in destinations.indexed)
                if (mini && index == 0)
                  ConstrainedBox(
                    constraints: BoxConstraints(minWidth: miniBackWidth),
                    child: item,
                  )
                else
                  Expanded(child: item),
            ],
          )
        : CustomNavigationBar(
            key: navKey,
            selectedKey: selected,
            onSelected: onSelected,
            expandItems: false,
            minItemWidth: minItemWidth,
            children: destinations,
          );
    return ShellLayeredDock(
      compact: compact,
      compactHeight: compactHeight,
      onHorizontalDragEnd: onHorizontalDragEnd,
      child: mini
          ? navigation
          : Builder(builder: (context) => wrapGlobal(context, navigation)),
    );
  }
}
