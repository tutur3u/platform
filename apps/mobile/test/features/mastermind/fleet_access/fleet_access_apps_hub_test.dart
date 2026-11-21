import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:mobile/features/mastermind/fleet_access/cubit/fleet_access_cubit.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_models.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/pump_app.dart';
import 'fleet_access_fakes.dart';

// Product rule: apps/docs/platform/features/fleet-access.mdx#mastermind-mobile
void main() {
  late FakeFleetAccessSource source;
  late FleetAccessCubit access;
  late AppTabCubit tabs;
  late ExperimentalAppsCubit experiments;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    final settings = SettingsRepository();
    tabs = AppTabCubit(settingsRepository: settings);
    experiments = ExperimentalAppsCubit(settingsRepository: settings);
    source = FakeFleetAccessSource();
    access = FleetAccessCubit(source: source);
  });

  tearDown(() async {
    await tabs.close();
    await experiments.close();
    await access.close();
  });

  final tile = find.byKey(const ValueKey('app-fleet_access'));

  Future<void> mount(
    WidgetTester tester, {
    ValueChanged<String>? onOpen,
  }) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 1400);
    addTearDown(tester.view.reset);
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: tabs),
          BlocProvider.value(value: experiments),
          BlocProvider.value(value: access),
        ],
        child: Scaffold(
          body: AppsHubPage(onSelected: (app) => onOpen?.call(app.route)),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('the Apps hub offers Fleet access while it is enabled', (
    tester,
  ) async {
    await mount(tester);
    expect(source.accessCalls, 1);
    expect(tile, findsOneWidget);
    expect(find.text('Fleet access'), findsOneWidget);
  });

  testWidgets('the tile opens the Fleet route', (tester) async {
    String? opened;
    await mount(tester, onOpen: (route) => opened = route);
    await tester.tap(tile);
    await tester.pumpAndSettle();
    expect(opened, '/mastermind/fleet-access');
  });

  for (final (name, answer) in [
    ('disabled', const FleetAccess.disabled() as Object),
    ('stopped', const FleetAccess(enabled: false, stopped: true)),
    ('failed', fleetApiError(503)),
  ]) {
    testWidgets('the Apps hub hides Fleet access while $name', (tester) async {
      source.accessAnswers
        ..clear()
        ..add(answer);
      await mount(tester);
      expect(tile, findsNothing);
    });
  }

  testWidgets('the tile is hidden while the check is still loading', (
    tester,
  ) async {
    source.accessGate = Completer<void>();
    await mount(tester);
    expect(access.state.status, FleetAccessStatus.loading);
    expect(tile, findsNothing);
    source.accessGate!.complete();
    await tester.pumpAndSettle();
    expect(tile, findsOneWidget);
  });

  testWidgets('a revoke mid-session takes the tile away', (tester) async {
    source.accessAnswers
      ..clear()
      ..addAll([observerAccess, const FleetAccess.disabled()]);
    await mount(tester);
    expect(tile, findsOneWidget);
    await access.handleForbidden();
    await tester.pumpAndSettle();
    expect(tile, findsNothing);
  });
}
