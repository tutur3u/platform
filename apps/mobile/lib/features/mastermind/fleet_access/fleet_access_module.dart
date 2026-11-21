import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/mastermind/fleet_access/fleet_access_routes.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_access_entry.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_access_page.dart';
import 'package:mobile/features/mastermind/mastermind_module.dart';
import 'package:mobile/l10n/l10n.dart';

/// The Apps-hub entry for Fleet access, separate from the owner-only
/// Mastermind entry. It shows only while `GET /api/v1/fleet/access` answers
/// enabled (hidden while that check loads or fails), and owns the Fleet route.
///
/// Listed before `mastermindModule`, so the shell takes the Fleet route's dock
/// from here: the Mastermind tabs show only to someone the owner gate admits,
/// and anyone else keeps only Back. The tabs mirror `mastermindModule`'s.
const fleetAccessModule = AppModule(
  id: 'fleet_access',
  route: Routes.mastermindFleetAccess,
  icon: LucideIcons.shieldCheck,
  labelBuilder: _label,
  pageBuilder: _page,
  isVisible: fleetAccessEntryVisible,
  miniAppNavItems: [
    MiniAppNavItem(
      id: 'mastermind_home',
      route: Routes.mastermind,
      icon: LucideIcons.house,
      labelBuilder: _labelHome,
      isVisible: mastermindOwnerVisible,
    ),
    MiniAppNavItem(
      id: 'mastermind_inbox',
      route: Routes.mastermindInbox,
      icon: LucideIcons.inbox,
      labelBuilder: _labelInbox,
      isVisible: mastermindOwnerVisible,
    ),
    MiniAppNavItem(
      id: 'mastermind_work',
      route: Routes.mastermindWork,
      icon: LucideIcons.briefcase,
      labelBuilder: _labelWork,
      isVisible: mastermindOwnerVisible,
    ),
    MiniAppNavItem(
      id: 'mastermind_ship',
      route: Routes.mastermindShip,
      icon: LucideIcons.rocket,
      labelBuilder: _labelShip,
      isVisible: mastermindOwnerVisible,
    ),
    MiniAppNavItem(
      id: 'mastermind_insights',
      route: Routes.mastermindInsights,
      icon: LucideIcons.chartLine,
      labelBuilder: _labelInsights,
      isVisible: mastermindOwnerVisible,
    ),
  ],
);

String _label(AppLocalizations l10n) => l10n.mastermindFleetAccessTitle;
String _labelHome(AppLocalizations l10n) => l10n.mastermindTabHome;
String _labelInbox(AppLocalizations l10n) => l10n.mastermindTabInbox;
String _labelWork(AppLocalizations l10n) => l10n.mastermindTabWork;
String _labelShip(AppLocalizations l10n) => l10n.mastermindTabShip;
String _labelInsights(AppLocalizations l10n) => l10n.mastermindTabInsights;

Widget _page(BuildContext context) => FleetAccessPage(
  initialView: fleetAccessViewFromQuery(
    GoRouterState.of(context).uri.queryParameters['view'],
  ),
);
