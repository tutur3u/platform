import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/habits/cubit/habits_state.dart';
import 'package:mobile/features/habits/widgets/habit_tracker_detail_sheet.dart';
import 'package:mobile/widgets/order_editor_sheet.dart';

import '../../helpers/helpers.dart';

const ValueKey<String> _handle = ValueKey('app-sheet-handle');

/// A 390x844 phone with a home indicator and an open 300dp keyboard.
Future<void> _open(
  WidgetTester tester,
  void Function(BuildContext context) open, {
  double keyboard = 300,
}) async {
  tester.view
    ..physicalSize = const Size(390, 844)
    ..devicePixelRatio = 1
    ..padding = const FakeViewPadding(bottom: 34)
    ..viewInsets = FakeViewPadding(bottom: keyboard);
  addTearDown(tester.view.reset);
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
  for (final host in ['showAdaptiveSheet', 'showAppSheet']) {
    testWidgets('$host builder context sees the keyboard already consumed', (
      tester,
    ) async {
      late EdgeInsets builderInsets;
      Widget body(BuildContext sheetContext) {
        // Legacy bodies pad for the keyboard from the builder context, as
        // Notes > Insert Link does; the host must have consumed it already.
        builderInsets = MediaQuery.viewInsetsOf(sheetContext);
        return Padding(
          padding: EdgeInsets.only(bottom: builderInsets.bottom),
          child: const Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(decoration: InputDecoration(hintText: 'Label')),
              TextField(decoration: InputDecoration(hintText: 'URL')),
              Text('Insert'),
            ],
          ),
        );
      }

      await _open(
        tester,
        (context) => host == 'showAdaptiveSheet'
            ? showAdaptiveSheet<void>(context: context, builder: body)
            : showAppSheet<void>(context: context, builder: body),
      );
      expect(builderInsets.bottom, 0);
      // The action sits just above the keyboard, not a keyboard-height above.
      final insert = tester.getRect(find.text('Insert'));
      expect(insert.bottom, lessThanOrEqualTo(844 - 300));
      expect(insert.bottom, greaterThan(844 - 300 - 120));
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('Home and Apps ordering sheet shows one handle', (tester) async {
    await _open(
      tester,
      keyboard: 0,
      (context) => showOrderEditorSheet(
        context,
        title: 'Order apps',
        builder: (_) => const Text('Order rows'),
      ),
    );
    expect(find.text('Order rows'), findsOneWidget);
    expect(find.byKey(_handle), findsOneWidget);
    expect(find.byType(AppSheetSurface), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Finance modal sheet shows one handle and one surface', (
    tester,
  ) async {
    await _open(
      tester,
      keyboard: 0,
      (context) => showFinanceModal<void>(
        context: context,
        builder: (_) => const FinanceModalScaffold(
          title: 'Checkpoints',
          child: Text('Wallet checkpoints'),
        ),
      ),
    );
    expect(find.text('Wallet checkpoints'), findsOneWidget);
    expect(find.byKey(_handle), findsOneWidget);
    expect(find.byType(AppSheetSurface), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Habits detail first load uses the 56dp page loader', (
    tester,
  ) async {
    tester.view
      ..physicalSize = const Size(390, 844)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpApp(
      HabitTrackerDetailSheet(
        detailStatus: HabitsStatus.loading,
        detailError: null,
        isDetailRefreshing: false,
        isSubmittingEntry: false,
        isSubmittingStreakAction: false,
        isArchivingTracker: false,
        onRetry: () async {},
        onLogEntry: () async {},
        onEditTracker: () async {},
        onDeleteEntry: (_) async {},
        onApplyStreakAction: (_) async {},
        onArchiveTracker: () async {},
      ),
    );
    await tester.pump();
    final mark = find.descendant(
      of: find.byKey(const ValueKey('app-loading-page')),
      matching: find.byType(SizedBox),
    );
    expect(tester.getSize(mark.first), const Size.square(56));
  });
}
