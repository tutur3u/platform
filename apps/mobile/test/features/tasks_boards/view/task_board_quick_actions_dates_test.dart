import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/utils/timezone_location.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:timezone/timezone.dart' as tz;

import '../../../helpers/phone_surface.dart';
import 'task_board_quick_actions_fixture.dart';
import 'task_board_row_actions_fixture.dart';

class _Timezone extends MockCubit<TimezoneSettingsState>
    implements TimezoneSettingsCubit {}

/// Text under the quick sheet's start or due date row.
Finder _inRow(String field, Finder matching) => find.descendant(
  of: quickActionTile('task-quick-$field-date'),
  matching: matching,
);

/// Taps the start or due date row, then [day] in the date picker.
Future<void> _pickDay(WidgetTester tester, String field, String day) async {
  await tester.ensureVisible(quickActionTile('task-quick-$field-date'));
  await tester.tap(quickActionTile('task-quick-$field-date'));
  await tester.pumpAndSettle();
  await tester.tap(
    find.descendant(
      of: find.byType(CalendarDatePicker),
      matching: find.text(day),
    ),
  );
}

void main() {
  late RowActionsWorkspaceCubit workspaceCubit;
  late QuickActionsRepository repository;

  setUp(() {
    workspaceCubit = rowActionsWorkspaceCubit();
    repository = QuickActionsRepository();
  });

  group('task quick actions dates', () {
    usePhoneSurface();

    Future<void> openSheet(
      WidgetTester tester, {
      String taskName = 'Alpha task',
      TimezoneSettingsCubit? timezone,
    }) => openQuickActionsSheet(
      tester,
      workspaceCubit: workspaceCubit,
      repository: repository,
      taskName: taskName,
      timezone: timezone,
    );

    testWidgets('shows the start and due dates', (tester) async {
      await openSheet(tester);

      expect(find.text('Dates'), findsOneWidget);
      expect(
        _inRow('start', find.textContaining('Oct 20, 2026')),
        findsOneWidget,
      );
      expect(
        _inRow('due', find.textContaining('Oct 24, 2026')),
        findsOneWidget,
      );
      expect(quickActionTile('task-quick-clear-start-date'), findsOneWidget);
      expect(quickActionTile('task-quick-clear-due-date'), findsOneWidget);
    });

    testWidgets('shows None for unset dates, with nothing to clear', (
      tester,
    ) async {
      await openSheet(tester, taskName: 'Beta task');

      expect(_inRow('start', find.text('None')), findsOneWidget);
      expect(_inRow('due', find.text('None')), findsOneWidget);
      expect(quickActionTile('task-quick-clear-start-date'), findsNothing);
      expect(quickActionTile('task-quick-clear-due-date'), findsNothing);
    });

    testWidgets('a picked start date saves the start of that day', (
      tester,
    ) async {
      await openSheet(tester);

      await _pickDay(tester, 'start', '22');
      await settleQuickActionMutation(tester);

      final update = repository.sent.single;
      expect(update.startDate, DateTime(2026, 10, 22));
      expect(update.clearStartDate, isFalse);
      // The due date is carried over unchanged.
      expect(update.endDate, DateTime(2026, 10, 24, 23, 59, 59));
      expect(update.clearEndDate, isFalse);
      // The picker closes; the sheet stays open with the new value.
      expect(find.byType(CalendarDatePicker), findsNothing);
      expect(
        _inRow('start', find.textContaining('Oct 22, 2026')),
        findsOneWidget,
      );
    });

    testWidgets('a due date before the start pulls the start onto it', (
      tester,
    ) async {
      await openSheet(tester);

      await _pickDay(tester, 'due', '18');
      await settleQuickActionMutation(tester);

      final update = repository.sent.single;
      expect(update.endDate, DateTime(2026, 10, 18, 23, 59, 59));
      expect(update.startDate, DateTime(2026, 10, 18));
    });

    testWidgets('picking the current day saves nothing', (tester) async {
      await openSheet(tester);

      await _pickDay(tester, 'due', '24');
      await tester.pumpAndSettle();

      expect(repository.sent, isEmpty);
    });

    testWidgets('the start date clears without a picker', (tester) async {
      await openSheet(tester);

      await tester.tap(quickActionTile('task-quick-clear-start-date'));
      await settleQuickActionMutation(tester);

      final update = repository.sent.single;
      expect(update.clearStartDate, isTrue);
      expect(update.startDate, isNull);
      expect(update.clearEndDate, isFalse);
      expect(update.endDate, DateTime(2026, 10, 24, 23, 59, 59));
      expect(_inRow('start', find.text('None')), findsOneWidget);
      expect(quickActionTile('task-quick-clear-start-date'), findsNothing);
      expect(find.byType(CalendarDatePicker), findsNothing);
    });

    testWidgets('a failed save restores the date and shows a toast', (
      tester,
    ) async {
      repository.updateError = const ApiException(
        message: 'Could not save the task',
        statusCode: 500,
      );
      await openSheet(tester);

      await tester.tap(quickActionTile('task-quick-clear-due-date'));
      await settleQuickActionMutation(tester);

      expect(repository.sent, isEmpty);
      expect(find.text('Could not save the task'), findsOneWidget);
      expect(
        _inRow('due', find.textContaining('Oct 24, 2026')),
        findsOneWidget,
      );
      expect(quickActionTile('task-quick-clear-due-date'), findsOneWidget);
      final task = readRowActionsCubit(
        tester,
      ).state.board!.tasks.firstWhere((task) => task.id == 'task-1');
      expect(task.endDate, DateTime(2026, 10, 24, 23, 59, 59));
      await drainToasts(tester);
    });

    testWidgets('reads and saves days in the timezone setting', (tester) async {
      // UTC+14 all year, so its day never matches the device's at midnight.
      const zone = 'Pacific/Kiritimati';
      final location = timezoneLocation(zone);
      DateTime instant(tz.TZDateTime wall) =>
          DateTime.fromMillisecondsSinceEpoch(wall.millisecondsSinceEpoch);
      final start = instant(tz.TZDateTime(location, 2026, 10, 20));
      repository.tasks['task-1'] = repository.tasks['task-1']!.copyWith(
        startDate: start,
        endDate: instant(tz.TZDateTime(location, 2026, 10, 24, 23, 59, 59)),
      );
      final timezone = _Timezone();
      whenListen(
        timezone,
        const Stream<TimezoneSettingsState>.empty(),
        initialState: const TimezoneSettingsState(
          personal: zone,
          loading: false,
          resolved: true,
        ),
      );

      await openSheet(tester, timezone: timezone);
      // The device reads this start as Oct 19; the setting reads Oct 20.
      expect(
        _inRow('start', find.textContaining('Oct 20, 2026')),
        findsOneWidget,
      );

      await _pickDay(tester, 'due', '26');
      await settleQuickActionMutation(tester);

      final update = repository.sent.single;
      expect(
        update.endDate!.isAtSameMomentAs(
          tz.TZDateTime(location, 2026, 10, 26, 23, 59, 59),
        ),
        isTrue,
      );
      // Sent zoned, so the repository keeps the carried start on Oct 20.
      expect(update.startDate, isA<tz.TZDateTime>());
      expect(update.startDate!.isAtSameMomentAs(start), isTrue);
      expect(
        _inRow('due', find.textContaining('Oct 26, 2026')),
        findsOneWidget,
      );
    });
  });
}
