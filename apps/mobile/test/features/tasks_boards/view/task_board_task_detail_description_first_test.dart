import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_viewer.dart';

import '../../../helpers/phone_surface.dart';
import 'task_board_quick_actions_fixture.dart';
import 'task_board_row_actions_fixture.dart';

final String _description = jsonEncode({
  'type': 'doc',
  'content': [
    {
      'type': 'paragraph',
      'content': [
        {'type': 'text', 'text': 'Read me first'},
      ],
    },
  ],
});

void main() {
  late QuickActionsRepository repository;

  setUp(() {
    repository = QuickActionsRepository();
    repository.tasks['task-1'] = repository.tasks['task-1']!.copyWith(
      description: _description,
    );
  });

  group('task detail sheet, description first', () {
    usePhoneSurface();

    Future<void> openSheet(WidgetTester tester) => openQuickActionsSheet(
      tester,
      workspaceCubit: rowActionsWorkspaceCubit(),
      repository: repository,
      expand: false,
      showProperties: false,
    );

    testWidgets('the description renders above the folded property list', (
      tester,
    ) async {
      await openSheet(tester);

      final viewer = find.byType(TaskDescriptionViewer);
      final toggle = quickActionTile('task-detail-properties-toggle');
      expect(viewer, findsOneWidget);
      // The middle detent shows the description without scrolling.
      final screen = tester.view.physicalSize / tester.view.devicePixelRatio;
      expect(tester.getTopLeft(viewer).dy, lessThan(screen.height));
      await tester.ensureVisible(toggle);
      await tester.pumpAndSettle();
      expect(
        tester.getTopLeft(viewer).dy,
        lessThan(tester.getTopLeft(toggle).dy),
      );
      // The chips sit between the title and the description.
      expect(
        tester.getTopLeft(quickActionTile('task-detail-status-chip')).dy,
        lessThan(tester.getTopLeft(viewer).dy),
      );
      // The property rows stay folded until asked for.
      expect(quickActionTile('task-quick-list'), findsNothing);
      expect(quickActionTile('task-quick-priority'), findsNothing);
    });

    testWidgets('every property has a chip under the title', (tester) async {
      await openSheet(tester);

      for (final chip in [
        'status',
        'priority',
        'due',
        'start',
        'assignees',
        'labels',
        'estimate',
      ]) {
        expect(
          quickActionTile('task-detail-$chip-chip'),
          findsOneWidget,
          reason: chip,
        );
      }
      // Values, not counts: the labels chip names its first label.
      expect(
        find.descendant(
          of: quickActionTile('task-detail-labels-chip'),
          matching: find.text('Finance'),
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('the priority chip opens the priority picker', (tester) async {
      await openSheet(tester);

      await tester.tap(quickActionTile('task-detail-priority-chip'));
      await tester.pumpAndSettle();

      expect(quickActionTile('task-quick-priority-low'), findsOneWidget);
      expect(quickActionTile('task-quick-priority-critical'), findsOneWidget);
      expect(repository.sent, isEmpty);
    });

    testWidgets('a chip shows the value its picker saved', (tester) async {
      await openSheet(tester);
      final chip = quickActionTile('task-detail-priority-chip');
      expect(
        find.descendant(of: chip, matching: find.text('High')),
        findsOneWidget,
      );

      await tester.tap(chip);
      await tester.pumpAndSettle();
      await tester.tap(quickActionTile('task-quick-priority-low'));
      await settleQuickActionMutation(tester);

      expect(repository.sent.single.priority, 'low');
      expect(
        find.descendant(of: chip, matching: find.text('Low')),
        findsOneWidget,
      );
      await drainToasts(tester);
    });

    testWidgets('the due date chip opens the date picker', (tester) async {
      await openSheet(tester);

      await tester.ensureVisible(quickActionTile('task-detail-due-chip'));
      await tester.pumpAndSettle();
      await tester.tap(quickActionTile('task-detail-due-chip'));
      await tester.pumpAndSettle();

      expect(find.byType(CalendarDatePicker), findsOneWidget);
      expect(repository.sent, isEmpty);
    });

    testWidgets('the property list unfolds and folds again', (tester) async {
      await openSheet(tester);
      final toggle = quickActionTile('task-detail-properties-toggle');

      await tester.ensureVisible(toggle);
      await tester.pumpAndSettle();
      await tester.tap(toggle);
      await tester.pumpAndSettle();

      for (final row in [
        'task-quick-list',
        'task-quick-priority',
        'task-quick-start-date',
        'task-quick-due-date',
        'task-quick-labels',
      ]) {
        expect(quickActionTile(row), findsOneWidget, reason: row);
      }
      expect(
        tester.getTopLeft(toggle).dy,
        lessThan(tester.getTopLeft(quickActionTile('task-quick-list')).dy),
      );

      await tester.ensureVisible(toggle);
      await tester.pumpAndSettle();
      await tester.tap(toggle);
      await tester.pumpAndSettle();
      expect(quickActionTile('task-quick-list'), findsNothing);
    });
  });
}
