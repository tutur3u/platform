import 'package:flutter/material.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/shell/view/dock_action_transition.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/features/shell/view/shell_route_fade.dart';

const double floatingDockHorizontalInset = ShellDockMetrics.inset;
const double floatingDockBottomGap = ShellDockMetrics.inset;
const floatingDockActionSize = 52.0;

bool usesRootDockSlots(String location) =>
    location == Routes.home ||
    location == Routes.apps ||
    location == Routes.assistant ||
    location == Routes.notifications ||
    location == Routes.profileRoot;

/// Lays out navigation and its page action in the floating dock.
/// Navigation fills the available width; composers can hug their content.
class FloatingDockRail extends StatelessWidget {
  const FloatingDockRail({
    required this.navigation,
    this.primary,
    this.showPrimary = true,
    this.actionLift = 0,
    this.fixedZones = false,
    super.key,
  });
  final Widget navigation;

  final Widget? primary;
  final bool showPrimary;
  final bool fixedZones;

  /// Raises the action off the row's bottom edge. Beside the navigation
  /// pill this is its inner padding, so the 52dp action shares the slots'
  /// centre line; beside a composer it is 0, so it stays on its last line.
  final double actionLift;

  @override
  Widget build(BuildContext context) {
    final action = Padding(
      padding: EdgeInsets.only(bottom: actionLift),
      // A push passes the circle straight to the next action: it keeps its
      // material and only the icon fades through.
      child: ShellRoutePrimaryFade(
        primary: primary,
        iconOf: (primary) =>
            primary is ShellDockActionButton ? primary.action.icon : null,
        builder: (context, primary, {required swap}) => DockActionTransition(
          key: const ValueKey('floating-dock-primary-transition'),
          slotKey: const ValueKey('floating-dock-primary-slot'),
          identity: primary?.key ?? primary?.runtimeType,
          immediate: swap,
          child: primary,
        ),
      ),
    );
    // One tree for both modes, so switching between navigation and a
    // composer never remounts the dock's material or the composer inside it.
    return Center(
      child: Row(
        key: const ValueKey('floating-dock-visible-group'),
        mainAxisSize: fixedZones ? MainAxisSize.max : MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Flexible(
            key: const ValueKey('floating-dock-navigation-slot'),
            fit: fixedZones ? FlexFit.tight : FlexFit.loose,
            child: Center(widthFactor: 1, child: navigation),
          ),
          Offstage(offstage: !showPrimary, child: action),
        ],
      ),
    );
  }
}
