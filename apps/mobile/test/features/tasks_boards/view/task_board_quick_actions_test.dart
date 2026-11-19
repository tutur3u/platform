import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/helpers.dart';
import '../../../helpers/phone_surface.dart';
import 'task_board_quick_actions_fixture.dart';
import 'task_board_row_actions_fixture.dart';

void main() {
  late RowActionsWorkspaceCubit workspaceCubit;
  late QuickActionsRepository repository;

  setUp(() {
    workspaceCubit = rowActionsWorkspaceCubit();
    repository = QuickActionsRepository();
  });

  group('task quick actions sheet', () {
    usePhoneSurface();

    Future<void> openSheet(WidgetTester tester) => openQuickActionsSheet(
      tester,
      workspaceCubit: workspaceCubit,
      repository: repository,
    );

    testWidgets('groups every property as a row with its value', (
      tester,
    ) async {
      await openSheet(tester);

      final rows = [
        'task-quick-list',
        'task-quick-priority',
        'task-quick-assignees',
        'task-quick-start-date',
        'task-quick-due-date',
        'task-quick-labels',
        'task-quick-estimate',
      ];
      final tops = <double>[];
      for (final key in rows) {
        final row = quickActionTile(key);
        expect(row, findsOneWidget, reason: key);
        expect(tester.getSize(row).height, greaterThanOrEqualTo(48));
        tops.add(tester.getTopLeft(row).dy);
      }
      expect(tops, orderedEquals([...tops]..sort()));
      // Values, not counts: the list and status, the priority and labels.
      expect(
        find.descendant(
          of: quickActionTile('task-quick-list'),
          matching: find.text('Todo · Active'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: quickActionTile('task-quick-priority'),
          matching: find.text('High'),
        ),
        findsOneWidget,
      );
      expect(find.textContaining('Finance', findRichText: true), findsWidgets);
      expect(find.textContaining(RegExp(r'^\+\d+$')), findsNothing);
      // The header carries the status and priority chips.
      expect(quickActionTile('task-detail-status-chip'), findsOneWidget);
      expect(quickActionTile('task-detail-priority-chip'), findsOneWidget);
    });

    testWidgets('the priority row opens the web priorities in web order', (
      tester,
    ) async {
      await openSheet(tester);
      await tester.tap(quickActionTile('task-quick-priority'));
      await tester.pumpAndSettle();

      const expected = {
        'none': LucideIcons.x,
        'critical': LucideLabIcons.unicornHead,
        'high': LucideLabIcons.horseHead,
        'normal': LucideIcons.rabbit,
        'low': LucideIcons.turtle,
      };
      final tops = <double>[];
      for (final MapEntry(key: priority, value: icon) in expected.entries) {
        final tile = quickActionTile('task-quick-priority-$priority');
        expect(
          find.descendant(of: tile, matching: find.byIcon(icon)),
          findsOneWidget,
        );
        tops.add(tester.getTopLeft(tile).dy);
      }
      expect(tops, orderedEquals([...tops]..sort()));
      for (final label in ['None', 'Urgent', 'High', 'Medium', 'Low']) {
        expect(find.text(label), findsWidgets);
      }
      expect(find.text('Critical'), findsNothing);
      expect(find.text('Normal'), findsNothing);
    });

    testWidgets('each property row opens its editor', (tester) async {
      await openSheet(tester);

      Future<void> opensAndCloses(String row, Finder editor) async {
        await tester.ensureVisible(quickActionTile(row));
        await tester.tap(quickActionTile(row));
        await tester.pumpAndSettle();
        expect(editor, findsWidgets, reason: row);
        await tester.tap(find.byKey(const ValueKey('app-sheet-close')).last);
        await tester.pumpAndSettle();
      }

      await opensAndCloses(
        'task-quick-list',
        quickActionTile('task-quick-list-list-2'),
      );
      await opensAndCloses(
        'task-quick-priority',
        quickActionTile('task-quick-priority-low'),
      );
      await opensAndCloses('task-quick-assignees', find.text('Lan'));
      await opensAndCloses('task-quick-labels', find.text('Work'));
      await opensAndCloses(
        'task-quick-estimate',
        quickActionTile('task-quick-estimate-none'),
      );
      await tester.tap(quickActionTile('task-quick-start-date'));
      await tester.pumpAndSettle();
      expect(find.byType(CalendarDatePicker), findsOneWidget);
      expect(repository.sent, isEmpty);
    });

    testWidgets('an edit tapped while another saves is dropped', (
      tester,
    ) async {
      await openSheet(tester);

      await pickQuickPriority(tester, 'critical');
      await tester.pump();

      // While the edit saves, every control is visibly disabled.
      expect(
        tester
            .widget<AppIconButton>(quickActionTile('task-quick-open-details'))
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<AppIconButton>(quickActionTile('task-quick-clear-due-date'))
            .onPressed,
        isNull,
      );
      for (final row in ['task-quick-labels', 'task-quick-priority']) {
        expect(
          tester.widget<AppGroupedRow>(quickActionTile(row)).onTap,
          isNull,
        );
      }
      expect(
        find.ancestor(
          of: quickActionTile('task-quick-labels'),
          matching: find.byType(Opacity),
        ),
        findsWidgets,
      );

      await tester.tap(
        quickActionTile('task-quick-priority'),
        warnIfMissed: false,
      );
      await settleQuickActionMutation(tester);

      expect(tester.takeException(), isNull);
      expect(quickActionTile('task-quick-priority-low'), findsNothing);
      expect(repository.sent.map((update) => update.priority), ['critical']);
      await drainToasts(tester);
    });

    testWidgets('a list choice moves the task and the sheet stays open', (
      tester,
    ) async {
      await openSheet(tester);

      await tester.tap(quickActionTile('task-quick-list'));
      await tester.pumpAndSettle();
      await tester.tap(quickActionTile('task-quick-list-list-2'));
      await tester.pumpAndSettle();

      expect(repository.moves, ['task-1->list-2']);
      expect(
        find.descendant(
          of: quickActionTile('task-quick-list'),
          matching: find.text('Done · Done'),
        ),
        findsOneWidget,
      );
      await drainToasts(tester);
    });

    testWidgets('None clears the priority', (tester) async {
      await openSheet(tester);

      await pickQuickPriority(tester, 'none');
      await settleQuickActionMutation(tester);

      final update = repository.sent.single;
      expect(update.clearPriority, isTrue);
      expect(update.priority, isNull);
      expect(
        find.descendant(
          of: quickActionTile('task-quick-priority'),
          matching: find.text('None'),
        ),
        findsOneWidget,
      );
    });

    testWidgets('an estimate choice saves it and None clears it', (
      tester,
    ) async {
      await openSheet(tester);

      await tester.ensureVisible(quickActionTile('task-quick-estimate'));
      await tester.tap(quickActionTile('task-quick-estimate'));
      await tester.pumpAndSettle();
      await tester.tap(quickActionTile('task-quick-estimate-3'));
      await settleQuickActionMutation(tester);

      expect(repository.sent.single.estimationPoints, 3);
      expect(
        find.descendant(
          of: quickActionTile('task-quick-estimate'),
          matching: find.text('3'),
        ),
        findsOneWidget,
      );
      await drainToasts(tester);
    });

    testWidgets('the title edits in place and saves on Done', (tester) async {
      await openSheet(tester);

      await tester.tap(quickActionTile('task-detail-title'));
      await tester.pumpAndSettle();
      await tester.enterText(
        quickActionTile('task-detail-title-field'),
        'Renamed task',
      );
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();

      expect(repository.sent.single.name, 'Renamed task');
      expect(find.text('Renamed task'), findsWidgets);
      await drainToasts(tester);
    });

    testWidgets('delete sits apart at the end and asks first', (tester) async {
      await openSheet(tester);

      final delete = quickActionTile('task-detail-delete');
      await tester.ensureVisible(delete);
      await tester.pumpAndSettle();
      // Separated from the last property group by a double section gap.
      final lastSection = tester.getBottomLeft(
        find
            .byType(AppGroupedCard)
            .at(find.byType(AppGroupedCard).evaluate().length - 2),
      );
      expect(
        tester.getTopLeft(delete).dy - lastSection.dy,
        greaterThanOrEqualTo(AppLayout.sectionGap * 2),
      );

      await tester.tap(delete);
      await tester.pumpAndSettle();
      expect(find.text('Delete task?'), findsWidgets);
      expect(repository.deletes, isEmpty);

      await tester.tap(find.text('Cancel').last);
      await tester.pumpAndSettle();
      expect(repository.deletes, isEmpty);
      expect(delete, findsOneWidget);
    });

    testWidgets('the due date clears without a picker', (tester) async {
      await openSheet(tester);

      await tester.tap(quickActionTile('task-quick-clear-due-date'));
      await tester.pumpAndSettle();

      expect(repository.sent.single.clearEndDate, isTrue);
      expect(
        find.descendant(
          of: quickActionTile('task-quick-due-date'),
          matching: find.text('None'),
        ),
        findsOneWidget,
      );
      await drainToasts(tester);
    });
  });

  group('task quick actions sheet layout', () {
    usePhoneSurface(size: const Size(320, 568));

    testWidgets('fits a small phone at 2x text without overflow', (
      tester,
    ) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await pumpRowActionsBoard(
        tester,
        workspaceCubit: workspaceCubit,
        repository: repository,
      );
      await tester.tap(find.text('Alpha task').first);
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('task-quick-open-details')),
        120,
        scrollable: find.byType(Scrollable).last,
      );
      expect(tester.takeException(), isNull);
    });
  });

  group('task quick actions sheet renders', () {
    setUpAll(DesignRender.loadFonts);

    for (final MapEntry(key: name, value: (settings, brightness))
        in DesignRender.themes.entries) {
      testWidgets('phone $name', (tester) async {
        DesignRender.setSize(tester, DesignRender.sizes['phone']!);
        await tester.pumpWidget(
          RepaintBoundary(
            key: DesignRenderApp.boundaryKey,
            child: appearanceTestApp(
              appearance: settings,
              brightness: brightness,
              home: MultiBlocProvider(
                providers: [
                  BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
                  BlocProvider(create: (_) => ShellChromeActionsCubit()),
                ],
                child: TaskBoardDetailPage(
                  boardId: 'board-1',
                  taskRepository: repository,
                ),
              ),
            ),
          ),
        );
        for (var i = 0; i < 3; i++) {
          await tester.pump(const Duration(milliseconds: 350));
        }
        await tester.pumpAndSettle();
        await tester.tap(find.text('Alpha task').first);
        await tester.pumpAndSettle();

        expect(quickActionTile('task-quick-priority'), findsOneWidget);
        await DesignRender.capture(tester, 'task-quick-actions-phone-$name');
      });
    }
  });
}
