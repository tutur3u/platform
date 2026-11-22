import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_page.dart';
import 'package:mobile/features/mastermind/iris/data/fixture_iris_relay.dart';
import 'package:mobile/features/mastermind/iris/data/iris_device_identity.dart';
import 'package:mobile/features/mastermind/iris/device/iris_device_trust.dart';
import 'package:mobile/features/mastermind/iris/iris_flag.dart';
import 'package:mobile/features/mastermind/iris/view/iris_devices_page.dart';
import 'package:mobile/features/mastermind/machines/machine_detail.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';
import 'package:mobile/features/mastermind/projects/projects_location.dart';
import 'package:mobile/features/mastermind/projects/view/project_thread_page.dart';
import 'package:mobile/features/mastermind/projects/view/projects_page.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mobile/features/mastermind/ship/ship_page.dart';
import 'package:mobile/features/mastermind/threads/mastermind_threads_page.dart';
import 'package:mobile/features/mastermind/threads/threads_flag.dart';
import 'package:mobile/features/mastermind/threads/threads_location.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_decision_page.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_item_page.dart';
import 'package:mobile/features/mastermind/view/insights/mastermind_insights_page.dart';
import 'package:mobile/features/mastermind/view/work/mastermind_lane_page.dart';

/// Tab routes other than Home, which the app registry owns at
/// [Routes.mastermind], plus the pushed Needs-you, decision and lane details,
/// and Iris devices. Inside the shell route.
final List<GoRoute> mastermindTabRoutes = [
  GoRoute(
    path: '/mastermind/work/machine/:machineId',
    builder: (context, state) =>
        MachineDetailPage(machineId: state.pathParameters['machineId'] ?? ''),
  ),
  GoRoute(
    path: '/mastermind/threads',
    redirect: (context, state) =>
        mastermindThreadsEnabled ? null : Routes.mastermindWork,
    builder: (context, state) {
      final query = state.uri.queryParameters;
      final router = GoRouter.of(context);
      return MastermindThreadsPage(
        initialSegment: workSegmentFromQuery(query['segment']),
        initialState: laneStateFromQuery(query['state']),
        initialProduct: productFromQuery(query['product']),
        initialArea: areaFromQuery(query['area']),
        onSelection: (selection) => router.go(
          threadsLocation(
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
    path: Routes.mastermindInbox,
    // `?tier=` only means something on Needs you and `?q=` on the segments
    // that list asks; anything else is dropped so the URL stays canonical.
    redirect: (context, state) {
      final query = state.uri.queryParameters;
      if (!query.containsKey('tier') && !query.containsKey('q')) return null;
      final canonical = inboxLocation(
        segment: inboxSegmentFromQuery(query['segment']),
        tier: inboxTierFromQuery(query['tier']),
        search: inboxSearchFromQuery(query['q']),
      );
      return canonical == state.uri.toString() ? null : canonical;
    },
    // The live fleet decisions inbox; see FleetInboxPage.
    builder: (context, state) => const FleetInboxPage(),
  ),
  GoRoute(
    path: Routes.mastermindIrisDevices,
    redirect: (context, state) =>
        mastermindIrisEnabled ? null : Routes.mastermindInbox,
    builder: (context, state) => IrisDevicesPage(
      relay: context.read<MastermindRuntime>().iris,
      // Fixture builds enrol with a synthetic key; every other build with the
      // hardware key, or not at all where there is none.
      identity: FixtureIrisRelay.buildEnabled
          ? const FakeIrisDeviceIdentity()
          : IrisDeviceTrust.platform,
    ),
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
    // Projects; `?state=` preselects a state chip. Older `?group=` links
    // open the same list.
    builder: (context, state) => ProjectsPage(
      key: ValueKey(state.uri.toString()),
      initialState: projectsStateFromQuery(state.uri.queryParameters['state']),
    ),
  ),
  GoRoute(
    path: projectThreadRoute,
    builder: (context, state) => ProjectThreadPage(
      key: ValueKey(state.uri.toString()),
      machine: projectsMachineFromQuery(state.uri.queryParameters),
      threadId: state.pathParameters['threadId'] ?? '',
    ),
  ),
  GoRoute(
    path: Routes.mastermindWorkLane,
    builder: (context, state) =>
        MastermindLanePage(laneId: state.pathParameters['laneId'] ?? ''),
  ),
  GoRoute(
    path: Routes.mastermindShip,
    // The live ship collector; a `?product=` from older links is ignored.
    builder: (context, state) => const ShipLivePage(),
  ),
  GoRoute(
    path: Routes.mastermindInsights,
    builder: (context, state) => const MastermindInsightsPage(),
  ),
];
