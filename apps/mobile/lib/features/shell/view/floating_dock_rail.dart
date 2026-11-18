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

/// The dock row: an optional leading zone, navigation, then one page-action
/// slot.
///
/// With [fixedZones] (the shell's navigation dock) the [leading] zone and
/// the action slot stay reserved while empty and the navigation fills the
/// rest, so Back or actions appearing, changing or leaving never resize the
/// navigation. Otherwise (composers) the row hugs its content and the action
/// slot opens only while an action shows.
class FloatingDockRail extends StatelessWidget {
  const FloatingDockRail({
    required this.navigation,
    this.primary,
    this.actionLift = 0,
    this.fixedZones = false,
    this.leading,
    super.key,
  });
  final Widget navigation;

  /// Shown before the navigation in [fixedZones] mode (the Back zone).
  final Widget? leading;
  final Widget? primary;
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
          reserveSpace: fixedZones,
          immediate: swap,
          child: primary,
        ),
      ),
    );
    // One tree for both modes, so switching between navigation and a
    // composer never remounts the dock's material or the composer inside it.
    final leadingZone = fixedZones ? leading : null;
    return Center(
      child: Row(
        key: const ValueKey('floating-dock-visible-group'),
        mainAxisSize: fixedZones ? MainAxisSize.max : MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Padding(
            key: const ValueKey('floating-dock-leading-slot'),
            padding: EdgeInsetsDirectional.only(
              bottom: actionLift,
              end: leadingZone == null ? 0 : ShellDockMetrics.zoneGap,
            ),
            child: leadingZone ?? const SizedBox.shrink(),
          ),
          Flexible(
            key: const ValueKey('floating-dock-navigation-slot'),
            fit: fixedZones ? FlexFit.tight : FlexFit.loose,
            child: Center(widthFactor: 1, child: navigation),
          ),
          action,
        ],
      ),
    );
  }
}
