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

    testWidgets('shows the web priority icons in the web order', (
      tester,
    ) async {
      await openSheet(tester);

      const expected = {
        'none': LucideIcons.x,
        'critical': LucideLabIcons.unicornHead,
        'high': LucideLabIcons.horseHead,
        'normal': LucideIcons.rabbit,
        'low': LucideIcons.turtle,
      };
      final lefts = <double>[];
      for (final MapEntry(key: priority, value: icon) in expected.entries) {
        final tile = quickActionTile('task-quick-priority-$priority');
        expect(
          find.descendant(of: tile, matching: find.byIcon(icon)),
          findsOneWidget,
        );
        expect(tester.getSize(tile).height, greaterThanOrEqualTo(48));
        lefts.add(tester.getTopLeft(tile).dx);
      }
      expect(lefts, orderedEquals([...lefts]..sort()));
      expect(
        tester.getSemantics(quickActionTile('task-quick-priority-high')),
        isSemantics(isSelected: true, isButton: true),
      );
      // Status choices only offer statuses that have a list on the board.
      expect(quickActionTile('task-quick-status-active'), findsOneWidget);
      expect(quickActionTile('task-quick-status-done'), findsOneWidget);
      expect(quickActionTile('task-quick-status-closed'), findsNothing);
      // Web wording: None, Urgent, High, Medium, Low.
      for (final label in ['None', 'Urgent', 'High', 'Medium', 'Low']) {
        expect(find.text(label), findsWidgets);
      }
      expect(find.text('Critical'), findsNothing);
      expect(find.text('Normal'), findsNothing);
      // Values replace the old count chips: names, not "+N".
      expect(find.textContaining('Finance', findRichText: true), findsWidgets);
      expect(find.textContaining(RegExp(r'^\+\d+$')), findsNothing);
    });

    testWidgets('an edit tapped while another saves is dropped', (
      tester,
    ) async {
      await openSheet(tester);

      await tester.tap(quickActionTile('task-quick-priority-critical'));
      await tester.pump();

      // While the edit saves, every control is visibly disabled.
      expect(
        tester
            .widget<AppButton>(quickActionTile('task-quick-open-details'))
            .enabled,
        isFalse,
      );
      expect(
        tester
            .widget<AppIconButton>(quickActionTile('task-quick-clear-due-date'))
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<AppGroupedRow>(quickActionTile('task-quick-labels'))
            .onTap,
        isNull,
      );
      expect(
        find.ancestor(
          of: quickActionTile('task-quick-labels'),
          matching: find.byType(Opacity),
        ),
        findsWidgets,
      );

      await tester.tap(
        quickActionTile('task-quick-priority-low'),
        warnIfMissed: false,
      );
      await settleQuickActionMutation(tester);

      expect(tester.takeException(), isNull);
      expect(repository.sent.map((update) => update.priority), ['critical']);
      await drainToasts(tester);
    });

    testWidgets('a status choice moves the task and closes the sheet', (
      tester,
    ) async {
      await openSheet(tester);

      await tester.tap(quickActionTile('task-quick-status-done'));
      await tester.pumpAndSettle();

      expect(repository.moves, ['task-1->list-2']);
      expect(quickActionTile('task-quick-status-done'), findsNothing);
      await drainToasts(tester);
    });

    testWidgets('None clears the priority', (tester) async {
      await openSheet(tester);

      await tester.tap(quickActionTile('task-quick-priority-none'));
      await settleQuickActionMutation(tester);

      final update = repository.sent.single;
      expect(update.clearPriority, isTrue);
      expect(update.priority, isNull);
      expect(
        tester.getSemantics(quickActionTile('task-quick-priority-none')),
        isSemantics(isSelected: true),
      );
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

        expect(quickActionTile('task-quick-priority-critical'), findsOneWidget);
        await DesignRender.capture(tester, 'task-quick-actions-phone-$name');
      });
    }
  });
}
