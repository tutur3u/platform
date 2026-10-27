import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_inbox_page.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_item_page.dart';
import 'package:mobile/features/mastermind/view/mastermind_placeholder_page.dart';

/// Tab routes other than Home, which the app registry owns at
/// [Routes.mastermind], plus the pushed Needs-you detail. Inside the shell
/// route.
final List<GoRoute> mastermindTabRoutes = [
  GoRoute(
    path: Routes.mastermindInbox,
    builder: (context, state) => const MastermindInboxPage(),
  ),
  GoRoute(
    path: Routes.mastermindInboxItem,
    builder: (context, state) =>
        MastermindItemPage(itemId: state.pathParameters['itemId'] ?? ''),
  ),
  for (final (path, tab) in [
    (Routes.mastermindWork, MastermindTab.work),
    (Routes.mastermindShip, MastermindTab.ship),
    (Routes.mastermindInsights, MastermindTab.insights),
  ])
    GoRoute(
      path: path,
      builder: (context, state) => MastermindPlaceholderPage(tab: tab),
    ),
];
