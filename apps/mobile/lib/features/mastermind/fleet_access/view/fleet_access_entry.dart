import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/fleet_access/cubit/fleet_access_cubit.dart';
import 'package:mobile/features/mastermind/fleet_access/fleet_access_routes.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/l10n/l10n.dart';

/// Pushes the Fleet view at [view].
void openFleetAccess(
  BuildContext context, {
  FleetAccessView view = FleetAccessView.status,
}) => unawaited(context.push(fleetAccessLocation(view: view)));

/// Rebuilds with whether the Fleet view is admitted, asking once when it
/// mounts. Entry points (a header action, a deep-link row) wrap themselves in
/// it, so none shows while the answer is loading, failed or disabled.
class FleetAccessVisibility extends StatefulWidget {
  const FleetAccessVisibility({required this.builder, super.key});

  final Widget Function(BuildContext context, bool visible) builder;

  @override
  State<FleetAccessVisibility> createState() => _FleetAccessVisibilityState();
}

class _FleetAccessVisibilityState extends State<FleetAccessVisibility> {
  @override
  void initState() {
    super.initState();
    unawaited(context.read<FleetAccessCubit?>()?.ensureLoaded());
  }

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<FleetAccessCubit?>();
    if (cubit == null) return widget.builder(context, false);
    return BlocConsumer<FleetAccessCubit, FleetAccessState>(
      bloc: cubit,
      // An account switch forgets the answer; ask again for the new account.
      listenWhen: (_, current) => current.status == FleetAccessStatus.initial,
      listener: (_, _) => unawaited(cubit.ensureLoaded()),
      buildWhen: (previous, current) => previous.visible != current.visible,
      builder: (context, state) => widget.builder(context, state.visible),
    );
  }
}

/// Whether a Fleet entry shows, for callers that read it during their build.
/// A forgotten answer (first use or an account switch) is asked for once the
/// frame ends.
bool fleetAccessEntryVisible(BuildContext context) {
  final cubit = context.read<FleetAccessCubit?>();
  if (cubit == null) return false;
  final status = context.select<FleetAccessCubit, FleetAccessStatus>(
    (c) => c.state.status,
  );
  if (status == FleetAccessStatus.initial) {
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => unawaited(cubit.ensureLoaded()),
    );
  }
  return context.select<FleetAccessCubit, bool>((c) => c.state.visible);
}

/// The Today navbar action that opens the Fleet view. It registers itself
/// beside Today's other navbar actions and adds nothing while Fleet access is
/// not admitted. Mount it anywhere in the Today page.
class FleetAccessTodayAction extends StatelessWidget {
  const FleetAccessTodayAction({super.key});

  @override
  Widget build(BuildContext context) => FleetAccessVisibility(
    builder: (context, visible) => ShellChromeActions(
      ownerId: 'mastermind-fleet-access-entry',
      locations: const {Routes.mastermind},
      actions: [
        if (visible)
          ShellActionSpec(
            id: 'mastermind-fleet-access',
            icon: LucideIcons.shieldCheck,
            tooltip: context.l10n.mastermindFleetAccessTitle,
            onPressed: () => openFleetAccess(context),
          ),
      ],
    ),
  );
}
