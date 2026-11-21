import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/fleet_access/cubit/fleet_access_cubit.dart';

/// The Fleet view's segments; `?view=` selects one.
enum FleetAccessView { status, requests, link, approvals }

FleetAccessView fleetAccessViewFromQuery(String? value) =>
    FleetAccessView.values.where((v) => v.name == value).firstOrNull ??
    FleetAccessView.status;

/// The Fleet view at [view]; Status is the bare route.
String fleetAccessLocation({FleetAccessView view = FleetAccessView.status}) =>
    view == FleetAccessView.status
    ? Routes.mastermindFleetAccess
    : '${Routes.mastermindFleetAccess}?view=${view.name}';

bool isFleetAccessLocation(String location) =>
    Routes.normalizeLocation(location) == Routes.mastermindFleetAccess;

/// Holds the route while the Fleet access check has not answered (the page
/// starts it) or could not finish (the page offers a retry), and sends a
/// refused account to the Apps hub. Only the Fleet answer counts here, never
/// the owner-only Mastermind gate.
bool shouldRedirectDisabledFleetAccessRoute(
  String matchedLocation,
  FleetAccessState accessState,
) => isFleetAccessLocation(matchedLocation) && accessState.denied;
