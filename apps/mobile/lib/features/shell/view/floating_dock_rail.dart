import 'package:flutter/material.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/shell/view/dock_action_transition.dart';

const double floatingDockHorizontalInset = ShellDockMetrics.inset;
const double floatingDockBottomGap = ShellDockMetrics.inset;
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
    this.actionLift = 0,
    super.key,
  });
  final Widget navigation;
  final Widget? primary;
  final Widget? secondary;

  /// Raises the actions off the row's bottom edge. Beside the navigation
  /// pill this is its inner padding, so 52dp actions share the slots' centre
  /// line; beside a composer it is 0, so they stay on its last line.
  final double actionLift;

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
            Padding(
              padding: EdgeInsets.only(bottom: actionLift),
              child: DockActionTransition(
                key: const ValueKey('floating-dock-primary-transition'),
                slotKey: const ValueKey('floating-dock-primary-slot'),
                identity: primary?.key ?? primary?.runtimeType,
                child: primary,
              ),
            ),
            Padding(
              padding: EdgeInsets.only(bottom: actionLift),
              child: DockActionTransition(
                key: const ValueKey('floating-dock-secondary-transition'),
                slotKey: const ValueKey('floating-dock-secondary-slot'),
                identity: secondary?.key ?? secondary?.runtimeType,
                // A narrower viewport must not retain an unusable second
                // column.
                immediate: !twoActions,
                child: twoActions ? secondary : null,
              ),
            ),
          ],
        ),
      );
    },
  );
}
