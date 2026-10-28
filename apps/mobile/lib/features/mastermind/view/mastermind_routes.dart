import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_inbox_page.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_item_page.dart';
import 'package:mobile/features/mastermind/view/mastermind_placeholder_page.dart';
import 'package:mobile/features/mastermind/view/work/mastermind_lane_page.dart';
import 'package:mobile/features/mastermind/view/work/mastermind_work_page.dart';

/// Tab routes other than Home, which the app registry owns at
/// [Routes.mastermind], plus the pushed Needs-you and lane details. Inside the
/// shell route.
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
  GoRoute(
    path: Routes.mastermindWork,
    builder: (context, state) {
      final query = state.uri.queryParameters;
      final router = GoRouter.of(context);
      return MastermindWorkPage(
        initialSegment: workSegmentFromQuery(query['segment']),
        initialState: laneStateFromQuery(query['state']),
        initialProduct: productFromQuery(query['product']),
        initialArea: areaFromQuery(query['area']),
        // The segment and filters live in the URL, so a lane pushed from the
        // list pops back to the same filtered location.
        onSelection: (selection) => router.go(
          workLocation(
            segment: selection.segment,
            state: selection.state,
            product: selection.product,
            area: selection.area,
          ),
        ),
      );
    },
  ),
  GoRoute(
    path: Routes.mastermindWorkLane,
    builder: (context, state) =>
        MastermindLanePage(laneId: state.pathParameters['laneId'] ?? ''),
  ),
  for (final (path, tab) in [
    (Routes.mastermindShip, MastermindTab.ship),
    (Routes.mastermindInsights, MastermindTab.insights),
  ])
    GoRoute(
      path: path,
      builder: (context, state) => MastermindPlaceholderPage(tab: tab),
    ),
];
