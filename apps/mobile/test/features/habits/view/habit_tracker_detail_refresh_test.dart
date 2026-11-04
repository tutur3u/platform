import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/habits/cubit/habits_state.dart';
import 'package:mobile/features/habits/widgets/habit_tracker_detail_sheet.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

import '../../../helpers/helpers.dart';
import 'habit_tracker_detail_fixture.dart';

void main() {
  for (final tab in ['Entries', 'Leaderboard']) {
    testWidgets('$tab pulls through the existing detail owner', (tester) async {
      final repository = DetailHabitTrackerRepository();
      final detail = await repository.getTrackerDetail(
        'ws-personal',
        'tracker-1',
      );
      var reads = 0;
      final pending = Completer<void>();
      await tester.pumpApp(
        HabitTrackerDetailSheet(
          detailStatus: HabitsStatus.loaded,
          detailError: null,
          isDetailRefreshing: false,
          isSubmittingEntry: false,
          isSubmittingStreakAction: false,
          isArchivingTracker: false,
          detail: detail,
          onRetry: () {
            reads++;
            return pending.future;
          },
          onLogEntry: () async {},
          onEditTracker: () async {},
          onDeleteEntry: (_) async {},
          onApplyStreakAction: (_) async {},
          onArchiveTracker: () async {},
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(Tab, tab));
      await tester.pumpAndSettle();
      await tester.drag(
        find.byType(NovaRefreshIndicator).last,
        const Offset(0, 450),
      );
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      expect(reads, 1);
      expect(find.byType(NovaLoadingIndicator), findsOneWidget);
      pending.complete();
      await tester.pumpAndSettle();
    });
  }
}
