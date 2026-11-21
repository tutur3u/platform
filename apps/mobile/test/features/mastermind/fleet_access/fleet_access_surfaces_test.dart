import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_page.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_today_page.dart';
import 'package:mobile/features/mastermind/fleet_access/cubit/fleet_access_cubit.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_models.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';

import '../../../helpers/mastermind_fleet_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';
import '../../../helpers/pump_app.dart';
import 'fleet_access_fakes.dart';

// Product rule: apps/docs/platform/features/fleet-access.mdx#mastermind-mobile
// The live Today and Inbox pages, with their Fleet access entries.
void main() {
  late MastermindViewHarness harness;
  late FakeFleetAccessSource source;
  late FleetAccessCubit access;
  late ShellChromeActionsCubit chrome;

  setUp(() async {
    harness = MastermindViewHarness(
      fleet: FleetCubit(source: FakeFleetSource(), newKey: () => 'key-1'),
    );
    await harness.setAccess(TestAccess.enabled);
    source = FakeFleetAccessSource();
    access = FleetAccessCubit(source: source);
    chrome = ShellChromeActionsCubit();
  });

  tearDown(() async {
    await harness.dispose();
    await access.close();
    await chrome.close();
  });

  Future<void> pump(WidgetTester tester, Widget page) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 4000);
    addTearDown(tester.view.reset);
    final router = GoRouter(
      initialLocation: '/',
      routes: [
        GoRoute(
          path: '/',
          builder: (_, _) => Scaffold(body: page),
        ),
        GoRoute(
          path: Routes.mastermindFleetAccess,
          builder: (_, state) =>
              Text('fleet ${state.uri.queryParameters['view']}'),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpAppRouter(
      router,
      wrap: (app) => MultiBlocProvider(
        providers: [
          BlocProvider.value(value: access),
          BlocProvider.value(value: chrome),
        ],
        child: harness.wrap(app),
      ),
    );
    for (var frame = 0; frame < 6; frame++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  Iterable<String> todayActions() => chrome.state
      .resolveForLocation(Routes.mastermind)
      .map((action) => action.id);

  final row = find.byKey(const ValueKey('fleet-access-requests-row'));

  group('Today', () {
    testWidgets('no navbar action while Fleet access is disabled', (
      tester,
    ) async {
      source.accessAnswers
        ..clear()
        ..add(const FleetAccess.disabled());
      await pump(tester, FleetTodayPage(now: () => fleetTestNow));
      expect(find.byType(FleetHealthHero), findsOneWidget);
      expect(source.accessCalls, 1);
      expect(todayActions(), isNot(contains('mastermind-fleet-access')));
    });

    testWidgets('the owner with Fleet access gets the navbar action', (
      tester,
    ) async {
      await pump(tester, FleetTodayPage(now: () => fleetTestNow));
      final action = chrome.state
          .resolveForLocation(Routes.mastermind)
          .singleWhere((a) => a.id == 'mastermind-fleet-access');
      expect(action.tooltip, 'Fleet access');
      action.onPressed!();
      for (var frame = 0; frame < 4; frame++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      // The Fleet route opens on Status.
      expect(find.text('fleet null'), findsOneWidget);
    });
  });

  group('Inbox', () {
    testWidgets('the Requests row is hidden while disabled', (tester) async {
      source.accessAnswers
        ..clear()
        ..add(const FleetAccess.disabled());
      await pump(tester, FleetInboxPage(now: () => fleetTestNow));
      expect(find.text('Urgent'), findsOneWidget);
      expect(row, findsNothing);
    });

    testWidgets('the Requests row opens the Requests view while enabled', (
      tester,
    ) async {
      await pump(tester, FleetInboxPage(now: () => fleetTestNow));
      expect(row, findsOneWidget);
      await tester.tap(row);
      for (var frame = 0; frame < 4; frame++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      expect(find.text('fleet requests'), findsOneWidget);
    });
  });
}
