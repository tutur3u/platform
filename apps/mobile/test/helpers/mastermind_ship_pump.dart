import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/mastermind/view/insights/mastermind_insights_page.dart';
import 'package:mobile/features/mastermind/view/ship/mastermind_ship_page.dart';

import 'helpers.dart';
import 'mastermind_view_harness.dart';
import 'mastermind_work_pump.dart';

/// Pumps [page] over [json] on a phone-width surface, bare or, with a
/// [router], through the production tab routes. [dockClearance] stands in for
/// the floating dock the shell reserves at the bottom.
Future<MastermindViewHarness> _pump(
  WidgetTester tester,
  Map<String, dynamic> json,
  Widget page, {
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
            child: page,
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

Future<MastermindViewHarness> pumpShip(
  WidgetTester tester,
  Map<String, dynamic> json, {
  GoRouter? router,
  TestAccess access = TestAccess.enabled,
  FakeHubSource? source,
  Size size = const Size(430, 4000),
  double dockClearance = 0,
}) => _pump(
  tester,
  json,
  const MastermindShipPage(),
  router: router,
  access: access,
  source: source,
  size: size,
  dockClearance: dockClearance,
);

Future<MastermindViewHarness> pumpInsights(
  WidgetTester tester,
  Map<String, dynamic> json, {
  GoRouter? router,
  TestAccess access = TestAccess.enabled,
  FakeHubSource? source,
  Size size = const Size(430, 12000),
  double dockClearance = 0,
}) => _pump(
  tester,
  json,
  const MastermindInsightsPage(),
  router: router,
  access: access,
  source: source,
  size: size,
  dockClearance: dockClearance,
);

double top(WidgetTester tester, String text) =>
    tester.getTopLeft(find.text(text).first).dy;
