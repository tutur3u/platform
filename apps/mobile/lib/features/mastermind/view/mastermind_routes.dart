import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';
import 'package:mobile/features/mastermind/presentation/ship_model.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_decision_page.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_inbox_page.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_item_page.dart';
import 'package:mobile/features/mastermind/view/insights/mastermind_chart_table_page.dart';
import 'package:mobile/features/mastermind/view/insights/mastermind_insights_page.dart';
import 'package:mobile/features/mastermind/view/ship/mastermind_ship_page.dart';
import 'package:mobile/features/mastermind/view/work/mastermind_lane_page.dart';
import 'package:mobile/features/mastermind/view/work/mastermind_work_page.dart';

/// Tab routes other than Home, which the app registry owns at
/// [Routes.mastermind], plus the pushed Needs-you, decision, lane and chart
/// table details. Inside the shell route.
final List<GoRoute> mastermindTabRoutes = [
  GoRoute(
    path: Routes.mastermindInbox,
    builder: (context, state) {
      final router = GoRouter.of(context);
      return MastermindInboxPage(
        initialSegment: inboxSegmentFromQuery(
          state.uri.queryParameters['segment'],
        ),
        // The segment lives in the URL, so a Home link can open Decisions and
        // switching never pushes: Back does not walk the segments.
        onSegment: (segment) => router.go(inboxLocation(segment: segment)),
      );
    },
  ),
  GoRoute(
    path: Routes.mastermindInboxItem,
    builder: (context, state) =>
        MastermindItemPage(itemId: state.pathParameters['itemId'] ?? ''),
  ),
  GoRoute(
    path: Routes.mastermindInboxDecision,
    builder: (context, state) => MastermindDecisionPage(
      decisionId: state.pathParameters['decisionId'] ?? '',
    ),
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
  GoRoute(
    path: Routes.mastermindShip,
    builder: (context, state) {
      final router = GoRouter.of(context);
      return MastermindShipPage(
        initialProduct: releaseProductFromQuery(
          state.uri.queryParameters['product'],
        ),
        // The product filter lives in the URL, so a Home row can link to it.
        onProduct: (product) => router.go(shipLocation(product: product)),
      );
    },
  ),
  GoRoute(
    path: Routes.mastermindInsights,
    builder: (context, state) => const MastermindInsightsPage(),
  ),
  GoRoute(
    path: Routes.mastermindInsightsTable,
    builder: (context, state) => MastermindChartTablePage(
      section: state.pathParameters['section'] ?? '',
      chartId: state.pathParameters['chartId'] ?? '',
    ),
  ),
];
