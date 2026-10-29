import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';
import 'package:mobile/features/mastermind/view/mastermind_home_page.dart';
import 'package:mobile/features/mastermind/view/mastermind_routes.dart';
import 'package:mobile/features/mastermind/view/work/mastermind_work_page.dart';

import 'helpers.dart';
import 'mastermind_view_harness.dart';

/// A phone-width surface tall enough to lay out a whole Work list.
void workSurface(WidgetTester tester, [Size size = const Size(430, 4000)]) {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}

/// Pumps the Work tab over [json], bare or, with a [router], through the
/// production tab routes.
Future<MastermindViewHarness> pumpWork(
  WidgetTester tester,
  Map<String, dynamic> json, {
  WorkSegment segment = WorkSegment.lanes,
  LaneState? state,
  GoRouter? router,
  TestAccess access = TestAccess.enabled,
  FakeHubSource? source,
  Size size = const Size(430, 4000),
  double dockClearance = 0,
}) async {
  workSurface(tester, size);
  final harness = MastermindViewHarness(
    source: source ?? FakeHubSource(bytes: snapshotBytes(json)),
  );
  addTearDown(harness.dispose);
  await harness.setAccess(access);
  if (router == null) {
    await tester.pumpApp(
      harness.wrap(
        Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(padding: EdgeInsets.only(bottom: dockClearance)),
            child: MastermindWorkPage(
              initialSegment: segment,
              initialState: state,
            ),
          ),
        ),
      ),
    );
  } else {
    await tester.pumpAppRouter(router, wrap: harness.wrap);
  }
  await tester.pumpAndSettle();
  return harness;
}

/// A router with Home and the Mastermind tab routes, starting at [initial].
GoRouter workRouter(String initial) {
  final router = GoRouter(
    initialLocation: initial,
    routes: [
      GoRoute(
        path: Routes.mastermind,
        builder: (_, _) => const MastermindHomePage(),
      ),
      ...mastermindTabRoutes,
    ],
  );
  addTearDown(router.dispose);
  return router;
}

/// The location the router shows. The route information provider's URI does
/// not follow a pushed route; the pushed match carries its own location.
Uri workUri(GoRouter router) {
  final configuration = router.routerDelegate.currentConfiguration;
  return switch (configuration.last) {
    final ImperativeRouteMatch pushed => pushed.matches.uri,
    _ => configuration.uri,
  };
}
