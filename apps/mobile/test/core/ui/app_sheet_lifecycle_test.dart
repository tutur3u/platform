import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:leak_tracker_flutter_testing/leak_tracker_flutter_testing.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';

import 'sheet_host_harness.dart';

AppSheetScaffold _searchSheet(TextEditingController query) => AppSheetScaffold(
  title: 'Pick',
  search: AppSheetSearch(
    controller: query,
    hint: 'Search picks',
    onChanged: (_) {},
  ),
  child: const Text('Body'),
);

bool _hasSearchAction(List<ShellActionSpec> actions) =>
    actions.any((action) => action.id.endsWith('/search'));

void main() {
  testWidgets('a root-navigator sheet covering the shell keeps search inline', (
    tester,
  ) async {
    final query = TextEditingController();
    addTearDown(query.dispose);
    final chrome = await pumpSheetHost(tester, (context) {
      unawaited(
        showAppSheet<void>(
          context: context,
          useRootNavigator: true,
          builder: (_) => _searchSheet(query),
        ),
      );
    });
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    // The navbar is covered, so the query field lives in the sheet.
    expect(find.byType(AppSearchField), findsOneWidget);
    final actions = chrome.state.resolveForLocation(sheetHostPage);
    expect(_hasSearchAction(actions), isFalse);
    // Back still closes the sheet first.
    await chrome.state.backForLocation(sheetHostPage)!();
    await tester.pumpAndSettle();
    expect(find.text('Body'), findsNothing);
    expect(find.text('Open'), findsOneWidget);
  });

  testWidgets('Back during a dialog exit transition closes the sheet beneath', (
    tester,
  ) async {
    late BuildContext sheetContext;
    late BuildContext dialogContext;
    final chrome = await pumpSheetHost(tester, (context) {
      unawaited(
        showAppSheet<void>(
          context: context,
          builder: (context) {
            sheetContext = context;
            return const AppSheetScaffold(title: 'Sheet', child: Text('Body'));
          },
        ),
      );
    });
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    unawaited(
      showAppDialog<void>(
        context: sheetContext,
        builder: (context) {
          dialogContext = context;
          return const AppDialog(title: 'Confirm');
        },
      ),
    );
    await tester.pumpAndSettle();
    final dialogOwner = chrome.state.topmostModalOwner;

    // External pop (not through the binding), then Back mid-transition.
    Navigator.of(dialogContext).pop();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    expect(find.text('Confirm'), findsOneWidget, reason: 'still animating');
    // The departing dialog no longer owns Back; the sheet does.
    expect(chrome.state.topmostModalOwner, isNot(dialogOwner));
    expect(chrome.state.topmostModalOwner, isNotNull);
    await chrome.state.backForLocation(sheetHostPage)!();
    await tester.pumpAndSettle();
    expect(find.text('Confirm'), findsNothing);
    expect(find.text('Body'), findsNothing);
    expect(find.text('Open'), findsOneWidget);
    expect(chrome.state.topmostModalOwner, isNull);
  });

  testWidgets(
    'opening and closing sheets, dialogs and search leaks nothing',
    experimentalLeakTesting: LeakTesting.settings.withTrackedAll().withIgnored(
      allNotGCed: true,
    ),
    (tester) async {
      final query = TextEditingController();
      addTearDown(query.dispose);
      late BuildContext sheetContext;
      final chrome = await pumpSheetHost(tester, (context) {
        unawaited(
          showAppSheet<void>(
            context: context,
            size: AppSheetSize.medium,
            builder: (context) {
              sheetContext = context;
              return _searchSheet(query);
            },
          ),
        );
      });
      for (var round = 0; round < 2; round++) {
        await tester.tap(find.text('Open'));
        await tester.pumpAndSettle();
        chrome.state.resolveForLocation(sheetHostPage).single.onPressed!();
        await tester.pump();
        unawaited(
          showAppDialog<void>(
            context: sheetContext,
            builder: (_) => const AppDialog(title: 'Confirm'),
          ),
        );
        await tester.pumpAndSettle();
        await chrome.state.backForLocation(sheetHostPage)!();
        await tester.pumpAndSettle();
        await chrome.state.backForLocation(sheetHostPage)!();
        await tester.pumpAndSettle();
        expect(find.text('Body'), findsNothing);
        expect(chrome.state.topmostModalOwner, isNull);
        expect(
          chrome.state.registrations.keys.where((k) => k != 'page'),
          isEmpty,
        );
      }
    },
  );

  group('system Back through the router dispatcher', () {
    late BuildContext sheetContext;
    late BuildContext dialogContext;

    Future<void> openSheetAndDialog(WidgetTester tester) async {
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (context, _) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () => unawaited(
                    showAppSheet<void>(
                      context: context,
                      builder: (context) {
                        sheetContext = context;
                        return const AppSheetScaffold(
                          title: 'Sheet',
                          child: Text('Body'),
                        );
                      },
                    ),
                  ),
                  child: const Text('Open'),
                ),
              ),
            ),
          ),
        ],
      );
      addTearDown(router.dispose);
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      unawaited(
        showAppDialog<void>(
          context: sheetContext,
          builder: (context) {
            dialogContext = context;
            return const AppDialog(title: 'Confirm');
          },
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('closes an open dialog first, then the sheet', (tester) async {
      await openSheetAndDialog(tester);
      // The sheet rebuilt when the dialog covered it; Back must still reach
      // the dialog rather than be swallowed by the sheet.
      expect(await tester.binding.handlePopRoute(), isTrue);
      await tester.pumpAndSettle();
      expect(find.text('Confirm'), findsNothing);
      expect(find.text('Body'), findsOneWidget);
      expect(await tester.binding.handlePopRoute(), isTrue);
      await tester.pumpAndSettle();
      expect(find.text('Body'), findsNothing);
      expect(find.text('Open'), findsOneWidget);
    });

    testWidgets('skips a departing dialog and closes the sheet', (
      tester,
    ) async {
      await openSheetAndDialog(tester);
      Navigator.of(dialogContext).pop();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 20));
      expect(find.text('Confirm'), findsOneWidget, reason: 'still animating');
      expect(await tester.binding.handlePopRoute(), isTrue);
      await tester.pumpAndSettle();
      expect(find.text('Confirm'), findsNothing);
      expect(find.text('Body'), findsNothing);
      expect(find.text('Open'), findsOneWidget);
    });
  });
}
