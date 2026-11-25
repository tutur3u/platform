import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/shell/cubit/sidebar_behavior.dart';
import 'package:mobile/l10n/l10n.dart';

String sidebarBehaviorLabel(BuildContext context, SidebarBehavior behavior) {
  final l10n = context.l10n;
  return switch (behavior) {
    SidebarBehavior.expanded => l10n.appearanceSidebarExpanded,
    SidebarBehavior.collapsed => l10n.appearanceSidebarCollapsed,
    SidebarBehavior.hover => l10n.appearanceSidebarHover,
    SidebarBehavior.minimal => l10n.appearanceSidebarMinimal,
  };
}

class ShellSidebarModeMenu extends StatelessWidget {
  const ShellSidebarModeMenu({
    required this.behavior,
    required this.onSelected,
    super.key,
  });

  final SidebarBehavior behavior;
  final ValueChanged<SidebarBehavior>? onSelected;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    return PopupMenuButton<SidebarBehavior>(
      tooltip: context.l10n.appearanceSidebarTitle,
      enabled: onSelected != null,
      color: colors.popover,
      icon: const Icon(LucideIcons.panelLeft),
      onSelected: onSelected,
      itemBuilder: (context) => [
        for (final value in SidebarBehavior.values)
          CheckedPopupMenuItem(
            value: value,
            checked: value == behavior,
            child: Text(sidebarBehaviorLabel(context, value)),
          ),
      ],
    );
  }
}

class ShellSidebarLogoTrigger extends StatelessWidget {
  const ShellSidebarLogoTrigger({required this.onTap, super.key});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final rtl = Directionality.of(context) == TextDirection.rtl;
    return SafeArea(
      key: const ValueKey('shell-sidebar-logo'),
      left: !rtl,
      right: rtl,
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.only(top: AppSpacing.md),
        child: Center(
          child: IconButton(
            tooltip: context.l10n.appearanceSidebarOpen,
            onPressed: onTap,
            icon: Image.asset(
              'assets/logos/transparent.png',
              width: 28,
              height: 28,
            ),
          ),
        ),
      ),
    );
  }
}
