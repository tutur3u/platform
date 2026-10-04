import 'package:flutter/material.dart';
import 'package:mobile/core/router/routes.dart';

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
    this.reserveEmptyActions = true,
    super.key,
  });
  final Widget navigation;
  final Widget? primary;
  final Widget? secondary;
  final bool reserveEmptyActions;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final twoActions = constraints.maxWidth >= 376;
      return Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            key: const ValueKey('floating-dock-navigation-slot'),
            child: Center(child: navigation),
          ),
          if (reserveEmptyActions || primary != null) ...[
            const SizedBox(width: 8),
            SizedBox(
              key: const ValueKey('floating-dock-primary-slot'),
              width: floatingDockActionSize,
              height: floatingDockActionSize,
              child: primary,
            ),
          ],
          if (twoActions && (reserveEmptyActions || secondary != null)) ...[
            const SizedBox(width: 8),
            SizedBox(
              width: floatingDockActionSize,
              height: floatingDockActionSize,
              child: secondary,
            ),
          ],
        ],
      );
    },
  );
}
