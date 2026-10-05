import 'package:flutter/material.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/shell/view/dock_action_transition.dart';

const floatingDockHorizontalInset = 12.0;
const floatingDockBottomGap = 8.0;
const floatingDockActionSize = 52.0;

bool usesRootDockSlots(String location) =>
    location == Routes.home ||
    location == Routes.apps ||
    location == Routes.assistant ||
    location == Routes.notifications ||
    location == Routes.profileRoot;

/// Stable navigation and primary-action columns across root destinations.
/// Reserving two columns on narrow phones would shrink five targets below 44px.
class FloatingDockRail extends StatelessWidget {
  const FloatingDockRail({
    required this.navigation,
    this.primary,
    this.secondary,
    super.key,
  });
  final Widget navigation;
  final Widget? primary;
  final Widget? secondary;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final twoActions = constraints.maxWidth >= 376;
      return Center(
        child: Row(
          key: const ValueKey('floating-dock-visible-group'),
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Flexible(
              key: const ValueKey('floating-dock-navigation-slot'),
              child: Center(widthFactor: 1, child: navigation),
            ),
            DockActionTransition(
              key: const ValueKey('floating-dock-primary-transition'),
              slotKey: const ValueKey('floating-dock-primary-slot'),
              identity: primary?.key ?? primary?.runtimeType,
              child: primary,
            ),
            DockActionTransition(
              key: const ValueKey('floating-dock-secondary-transition'),
              slotKey: const ValueKey('floating-dock-secondary-slot'),
              identity: secondary?.key ?? secondary?.runtimeType,
              // A narrower viewport must not retain an unusable second column.
              immediate: !twoActions,
              child: twoActions ? secondary : null,
            ),
          ],
        ),
      );
    },
  );
}
