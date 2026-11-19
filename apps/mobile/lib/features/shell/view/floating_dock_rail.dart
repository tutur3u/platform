import 'package:flutter/material.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/features/shell/view/dock_action_transition.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/features/shell/view/shell_route_fade.dart';

const double floatingDockHorizontalInset = ShellDockMetrics.inset;
const double floatingDockBottomGap = ShellDockMetrics.inset;

/// Lays out the dock's Back, navigation and priority action.
/// Idle navigation reserves both circles; composers can hug their content.
class FloatingDockRail extends StatelessWidget {
  const FloatingDockRail({
    required this.navigation,
    this.leading,
    this.primary,
    this.showPrimary = true,
    this.actionLift = 0,
    this.fixedZones = false,
    super.key,
  });
  final Widget navigation;
  final Widget? leading;
  final Widget? primary;
  final bool showPrimary;
  final bool fixedZones;

  /// Raises the action off the row's bottom edge in the flexible layout.
  final double actionLift;

  @override
  Widget build(BuildContext context) {
    final action = Padding(
      padding: EdgeInsets.only(bottom: fixedZones ? 0 : actionLift),
      // A push passes the circle straight to the next action: it keeps its
      // material and only the icon fades through.
      child: ShellRoutePrimaryFade(
        primary: fixedZones && !showPrimary ? null : primary,
        iconOf: (primary) =>
            primary is ShellDockActionButton ? primary.action.icon : null,
        builder: (context, primary, {required swap}) => DockActionTransition(
          key: const ValueKey('floating-dock-primary-transition'),
          slotKey: const ValueKey('floating-dock-primary-slot'),
          identity: primary?.key ?? primary?.runtimeType,
          immediate: swap,
          reserveSpace: fixedZones,
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
        crossAxisAlignment: fixedZones
            ? CrossAxisAlignment.center
            : CrossAxisAlignment.end,
        children: [
          if (fixedZones) ...[
            SizedBox.square(
              key: const ValueKey('floating-dock-back-slot'),
              dimension: ShellDockMetrics.slot,
              // Back keeps its circle's room while it fades and scales in or
              // out, so the navigation beside it never moves.
              child: DockActionTransition(
                key: const ValueKey('floating-dock-back-transition'),
                slotKey: const ValueKey('floating-dock-back-visible'),
                identity: leading?.runtimeType,
                reserveSpace: true,
                child: leading,
              ),
            ),
            const SizedBox(width: ShellDockMetrics.zoneGap),
          ],
          Flexible(
            key: const ValueKey('floating-dock-navigation-slot'),
            fit: fixedZones ? FlexFit.tight : FlexFit.loose,
            child: Center(widthFactor: 1, child: navigation),
          ),
          if (fixedZones) const SizedBox(width: ShellDockMetrics.zoneGap),
          Offstage(
            key: const ValueKey('floating-dock-priority-zone'),
            offstage: !fixedZones && !showPrimary,
            child: action,
          ),
        ],
      ),
    );
  }
}
