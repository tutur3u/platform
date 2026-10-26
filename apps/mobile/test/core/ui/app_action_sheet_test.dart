import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/ui/ui.dart';

import '../../helpers/helpers.dart';
import 'sheet_host_harness.dart';

/// Phone with a 2x text scale, a home indicator and a 300dp keyboard.
Future<void> _pumpSmallPhone(
  WidgetTester tester,
  void Function(BuildContext context) open, {
  double keyboard = 0,
}) async {
  tester.view
    ..physicalSize = const Size(320, 568)
    ..devicePixelRatio = 1
    ..padding = const FakeViewPadding(bottom: 34)
    ..viewInsets = FakeViewPadding(bottom: keyboard);
  addTearDown(tester.view.reset);
  tester.platformDispatcher.textScaleFactorTestValue = 2;
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  await tester.pumpApp(
    Builder(
      builder: (context) => Center(
        child: TextButton(
          onPressed: () => open(context),
          child: const Text('Open'),
        ),
      ),
    ),
  );
  await tester.tap(find.text('Open'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('action sheet resolves the tapped value and closes', (
    tester,
  ) async {
    String? picked = 'unset';
    await pumpSheetHost(tester, (context) async {
      picked = await showAppActionSheet<String>(
        context: context,
        title: 'More',
        actions: const [
          AppSheetAction(
            icon: LucideIcons.history,
            label: 'History',
            value: 'h',
          ),
          AppSheetAction(label: 'Disabled', value: 'x', enabled: false),
          AppSheetAction(
            icon: LucideIcons.trash2,
            label: 'Delete',
            value: 'd',
            destructive: true,
          ),
        ],
      );
    });
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('app-sheet-handle')), findsOneWidget);
    expect(find.byKey(const ValueKey('app-sheet-close')), findsOneWidget);
    await tester.tap(find.text('Disabled'));
    await tester.pumpAndSettle();
    expect(find.text('History'), findsOneWidget);

    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    expect(picked, 'd');
    expect(find.text('History'), findsNothing);
  });

  testWidgets('action callbacks run without closing the sheet for them', (
    tester,
  ) async {
    var calls = 0;
    await pumpSheetHost(tester, (context) async {
      await showAppActionSheet<void>(
        context: context,
        title: 'Attach',
        actions: [AppSheetAction(label: 'Files', onPressed: () => calls++)],
      );
    });
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Files'));
    await tester.pumpAndSettle();
    expect(calls, 1);
    expect(find.text('Files'), findsOneWidget);
  });

  testWidgets('choice sheet marks the selection and returns the pick', (
    tester,
  ) async {
    int? picked;
    await pumpSheetHost(tester, (context) async {
      picked = await showAppChoiceSheet<int>(
        context: context,
        title: 'Delay',
        selected: 2,
        choices: const [
          AppSheetChoice(value: 1, label: 'One'),
          AppSheetChoice(value: 2, label: 'Two'),
        ],
      );
    });
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    final two = tester.widget<AppOptionTile>(
      find.widgetWithText(AppOptionTile, 'Two'),
    );
    expect(two.selected, isTrue);
    await tester.tap(find.text('One'));
    await tester.pumpAndSettle();
    expect(picked, 1);
  });

  testWidgets('last action clears the home indicator at 2x text on 320x568', (
    tester,
  ) async {
    await _pumpSmallPhone(
      tester,
      (context) => showAppActionSheet<String>(
        context: context,
        title: 'More options',
        actions: [
          for (final label in ['Recent chats', 'Settings', 'Appearance'])
            AppSheetAction(label: label, value: label),
        ],
      ),
    );
    final last = find.text('Appearance');
    await tester.scrollUntilVisible(last, 40);
    await tester.pumpAndSettle();
    expect(tester.getRect(last).bottom, lessThanOrEqualTo(568 - 34));
    expect(tester.takeException(), isNull);
  });

  testWidgets('legacy adaptive sheets share the surface, handle and insets', (
    tester,
  ) async {
    late EdgeInsets bodyInsets;
    await _pumpSmallPhone(
      tester,
      keyboard: 300,
      (context) => showAdaptiveSheet<void>(
        context: context,
        builder: (sheetContext) => Builder(
          builder: (context) {
            bodyInsets = MediaQuery.viewInsetsOf(context);
            return const Column(
              mainAxisSize: MainAxisSize.min,
              children: [AppSheetHandle(), Text('Legacy body')],
            );
          },
        ),
      ),
    );
    expect(find.byType(AppSheetSurface), findsOneWidget);
    // The host draws the handle; the body's own handle stays hidden.
    expect(find.byKey(const ValueKey('app-sheet-handle')), findsOneWidget);
    // The host consumed the keyboard once; the body must not pad again.
    expect(bodyInsets.bottom, 0);
    expect(
      tester.getRect(find.text('Legacy body')).bottom,
      lessThanOrEqualTo(568 - 300),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('a body handle still shows outside a sheet host', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: const Scaffold(body: AppSheetHandle()),
      ),
    );
    expect(find.byKey(const ValueKey('app-sheet-handle')), findsOneWidget);
  });
}
