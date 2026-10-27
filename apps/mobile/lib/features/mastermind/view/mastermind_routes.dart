import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/view/mastermind_placeholder_page.dart';

/// Tab routes other than Home, which the app registry owns at
/// [Routes.mastermind]. Inside the shell route.
final List<GoRoute> mastermindTabRoutes = [
  for (final (path, tab) in [
    (Routes.mastermindInbox, MastermindTab.inbox),
    (Routes.mastermindWork, MastermindTab.work),
    (Routes.mastermindShip, MastermindTab.ship),
    (Routes.mastermindInsights, MastermindTab.insights),
  ])
    GoRoute(
      path: path,
      builder: (context, state) => MastermindPlaceholderPage(tab: tab),
    ),
];
