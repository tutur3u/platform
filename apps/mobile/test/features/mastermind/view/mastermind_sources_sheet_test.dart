import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/view/home_needs_you_card.dart';
import 'package:mobile/features/mastermind/view/mastermind_home_page.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_home_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

Future<ShellChromeActionsCubit> _pumpHome(
  WidgetTester tester, {
  Size size = const Size(430, 4000),
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  final json = homeJson();
  json['sources'] = [
    {'source': 'inbox', 'state': 'ok'},
    {'source': 'ci', 'state': 'stale'},
  ];
  final harness = MastermindViewHarness(
    source: FakeHubSource(bytes: snapshotBytes(json)),
  );
  addTearDown(harness.dispose);
  await harness.setAccess(TestAccess.enabled);
  final chrome = ShellChromeActionsCubit();
  addTearDown(chrome.close);
  await tester.pumpApp(
    BlocProvider<ShellChromeActionsCubit>.value(
      value: chrome,
      child: harness.wrap(const MastermindHomePage()),
    ),
  );
  await tester.pumpAndSettle();
  return chrome;
}

void main() {
  group('Home Data sources action', () {
    testWidgets('is registered for Home and opens the Sources sheet', (
      tester,
    ) async {
      final chrome = await _pumpHome(tester);
      final actions = chrome.state.resolveForLocation(Routes.mastermind);
      final action = actions.singleWhere(
        (action) => action.id == 'mastermind-sources',
      );
      expect(action.tooltip, 'Data sources');
      expect(find.text('Sources'), findsNothing);

      action.onPressed!();
      await tester.pumpAndSettle();
      expect(find.text('Sources'), findsOneWidget);
      expect(find.text('CI'), findsOneWidget);
      expect(find.text('Stale'), findsOneWidget);
      expect(find.text('Inbox'), findsOneWidget);
      expect(find.text('OK'), findsOneWidget);
    });

    testWidgets('stays registered after Home scrolls on a phone', (
      tester,
    ) async {
      // A phone viewport, not a tall surface: the lazy list must really
      // dispose the rows that scroll away.
      final chrome = await _pumpHome(tester, size: const Size(390, 844));
      bool registered() => chrome.state
          .resolveForLocation(Routes.mastermind)
          .any((action) => action.id == 'mastermind-sources');
      expect(registered(), isTrue);

      await tester.drag(find.byType(CustomScrollView), const Offset(0, -6000));
      await tester.pumpAndSettle();
      expect(find.byType(HomeNeedsYouCard), findsNothing);
      expect(registered(), isTrue);

      await tester.drag(find.byType(CustomScrollView), const Offset(0, 6000));
      await tester.pumpAndSettle();
      expect(registered(), isTrue);
    });

    testWidgets('is on Home only', (tester) async {
      final chrome = await _pumpHome(tester);
      expect(chrome.state.resolveForLocation(Routes.mastermindInbox), isEmpty);
    });

    testWidgets('the strip on Home opens the same sheet', (tester) async {
      await _pumpHome(tester);
      await tester.tap(find.textContaining('1 source degraded'));
      await tester.pumpAndSettle();
      expect(find.text('Sources'), findsOneWidget);
      expect(find.text('CI'), findsOneWidget);
    });
  });
}
