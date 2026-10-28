import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_cubit.dart';
import 'package:mobile/features/mastermind/threads/threads_flag.dart';
import 'package:mobile/features/mastermind/view/mastermind_home_page.dart';
import 'package:mobile/l10n/l10n.dart';

/// The Apps-hub entry. Not an experimental module: visibility comes only from
/// the access cubit (root workspace, `view_infrastructure`, configured source).
/// That is cosmetic; the hub's own allowlist is the real authority.
const mastermindModule = AppModule(
  id: 'mastermind',
  route: Routes.mastermind,
  icon: LucideIcons.brainCircuit,
  labelBuilder: _label,
  pageBuilder: _page,
  isVisible: _visible,
  miniAppNavItems: [
    MiniAppNavItem(
      id: 'mastermind_home',
      route: Routes.mastermind,
      icon: LucideIcons.house,
      labelBuilder: _labelHome,
    ),
    MiniAppNavItem(
      id: 'mastermind_inbox',
      route: Routes.mastermindInbox,
      icon: LucideIcons.inbox,
      labelBuilder: _labelInbox,
    ),
    // Work and Threads share a dock slot: the feature flag decides which one
    // shows, so a build can flip it without rebuilding the module.
    MiniAppNavItem(
      id: 'mastermind_work',
      route: Routes.mastermindWork,
      icon: LucideIcons.briefcase,
      labelBuilder: _labelWork,
      isVisible: _workVisible,
    ),
    MiniAppNavItem(
      id: 'mastermind_threads',
      route: '/mastermind/threads',
      icon: LucideIcons.messagesSquare,
      labelBuilder: _labelThreads,
      isVisible: _threadsVisible,
      // A lane opened from Threads, Home or Inbox lives under the Work path.
      aliasRoutes: [Routes.mastermindWork],
    ),
    MiniAppNavItem(
      id: 'mastermind_ship',
      route: Routes.mastermindShip,
      icon: LucideIcons.rocket,
      labelBuilder: _labelShip,
    ),
    MiniAppNavItem(
      id: 'mastermind_insights',
      route: Routes.mastermindInsights,
      icon: LucideIcons.chartLine,
      labelBuilder: _labelInsights,
    ),
  ],
);

String _label(AppLocalizations l10n) => l10n.mastermindAppName;
String _labelHome(AppLocalizations l10n) => l10n.mastermindTabHome;
String _labelInbox(AppLocalizations l10n) => l10n.mastermindTabInbox;
String _labelWork(AppLocalizations l10n) => l10n.mastermindTabWork;
String _labelThreads(AppLocalizations l10n) => l10n.mastermindThreadsTitle;
bool _workVisible(BuildContext context) => !mastermindThreadsEnabled;
bool _threadsVisible(BuildContext context) => mastermindThreadsEnabled;
String _labelShip(AppLocalizations l10n) => l10n.mastermindTabShip;
String _labelInsights(AppLocalizations l10n) => l10n.mastermindTabInsights;
Widget _page(BuildContext context) => const MastermindHomePage();

bool _visible(BuildContext context) =>
    context.select<MastermindAccessCubit?, bool>(
      (cubit) =>
          cubit?.state.status == MastermindAccessStatus.loaded &&
          cubit?.state.visible == true,
    );
