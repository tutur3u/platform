import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/ui/ui.dart';

import 'sheet_host_harness.dart';

void main() {
  testWidgets('modal registration replaces page actions and Back', (
    tester,
  ) async {
    final query = TextEditingController();
    addTearDown(query.dispose);
    String? result = 'unset';
    final chrome = await pumpSheetHost(tester, (context) async {
      result = await showAppSheet<String>(
        context: context,
        size: AppSheetSize.large,
        builder: (_) => AppSheetScaffold(
          title: 'Pick',
          search: AppSheetSearch(
            controller: query,
            hint: 'Search picks',
            onChanged: (_) {},
          ),
          child: const Text('Body'),
        ),
      );
    });
    expect(chrome.state.backForLocation(sheetHostPage), isNull);
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();

    final actions = chrome.state.resolveForLocation(sheetHostPage);
    expect(actions.map((a) => a.id).single, endsWith('/search'));
    expect(actions.single.inDock, isTrue);
    // Inside the shell there is no inline search field.
    expect(find.byType(EditableText), findsNothing);

    // Activating the dock action hands its controller to the top navbar.
    actions.single.onPressed!();
    await tester.pump();
    expect(
      chrome.state.resolveForLocation(sheetHostPage).single.searchController,
      same(query),
    );

    // Dock or shell Back closes the sheet, not the page underneath.
    await chrome.state.backForLocation(sheetHostPage)!();
    await tester.pumpAndSettle();
    expect(find.text('Body'), findsNothing);
    expect(find.text('Open'), findsOneWidget);
    expect(result, isNull);
    expect(chrome.state.topmostModalOwner, isNull);
    expect(chrome.state.resolveForLocation(sheetHostPage).map((a) => a.id), [
      'page-add',
    ]);
  });

  testWidgets('a dialog above a sheet owns Back until it closes', (
    tester,
  ) async {
    late BuildContext sheetContext;
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
        builder: (_) => const AppDialog(title: 'Confirm'),
      ),
    );
    await tester.pumpAndSettle();

    await chrome.state.backForLocation(sheetHostPage)!();
    await tester.pumpAndSettle();
    expect(find.text('Confirm'), findsNothing);
    expect(find.text('Body'), findsOneWidget);

    await chrome.state.backForLocation(sheetHostPage)!();
    await tester.pumpAndSettle();
    expect(find.text('Body'), findsNothing);
    expect(find.text('Open'), findsOneWidget);
  });

  testWidgets('outside the shell the sheet falls back to an inline field', (
    tester,
  ) async {
    final query = TextEditingController();
    addTearDown(query.dispose);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () => showAppSheet<void>(
              context: context,
              builder: (_) => AppSheetScaffold(
                title: 'Pick',
                search: AppSheetSearch(
                  controller: query,
                  hint: 'Search picks',
                  onChanged: (_) {},
                ),
                child: const Text('Body'),
              ),
            ),
            child: const Text('Open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(find.byType(AppSearchField), findsOneWidget);
    // System Back pops the sheet only.
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Body'), findsNothing);
    expect(find.text('Open'), findsOneWidget);
  });

  testWidgets('AppSelect picks through a sheet with selected semantics', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    String? picked;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: Center(
            child: AppSelect<String>(
              title: 'Size',
              value: 'm',
              options: const [
                AppSelectOption(value: 's', label: 'Small'),
                AppSelectOption(value: 'm', label: 'Medium'),
              ],
              onChanged: (value) => picked = value,
            ),
          ),
        ),
      ),
    );
    expect(
      tester.getSize(find.byType(AppSelect<String>)).height,
      greaterThanOrEqualTo(kAppMinTapTarget),
    );
    await tester.tap(find.text('Medium'));
    await tester.pumpAndSettle();
    final medium = find.widgetWithText(AppOptionTile, 'Medium');
    expect(tester.widget<AppOptionTile>(medium).selected, isTrue);
    await tester.tap(find.widgetWithText(AppOptionTile, 'Small'));
    await tester.pumpAndSettle();
    expect(picked, 's');
    expect(find.byType(AppOptionTile), findsNothing);
  });
}
