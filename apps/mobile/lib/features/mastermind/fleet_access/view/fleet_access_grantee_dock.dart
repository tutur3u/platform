import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_dock_action_group.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';

/// The Fleet view's dock for anyone without Mastermind access: an empty
/// action group takes the place of the Mastermind tabs, which would only send
/// them back to the Apps hub, and Back stays. The owner keeps the tabs.
class FleetAccessGranteeDock extends StatelessWidget {
  const FleetAccessGranteeDock({super.key});

  @override
  Widget build(BuildContext context) {
    final owner = context.select<MastermindAccessCubit?, bool>(
      (cubit) =>
          cubit?.state.status == MastermindAccessStatus.loaded &&
          cubit?.state.visible == true,
    );
    if (owner) return const SizedBox.shrink();
    return const ShellChromeActions(
      ownerId: 'mastermind-fleet-access-grantee-dock',
      locations: {Routes.mastermindFleetAccess},
      actionGroup: ShellDockActionGroup(),
    );
  }
}
