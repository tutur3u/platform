import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/helpers.dart';
import '../../../helpers/phone_surface.dart';
import 'task_board_quick_actions_fixture.dart';
import 'task_board_row_actions_fixture.dart';
import 'task_board_task_detail_fixture.dart';

Finder _key(String key) => find.byKey(ValueKey(key));

void main() {
  late TaskDetailRepository repository;

  setUp(() => repository = TaskDetailRepository());

  group('task create form', () {
    usePhoneSurface();

    testWidgets('a dirty form confirms before closing', (tester) async {
      await pumpRowActionsBoard(
        tester,
        workspaceCubit: rowActionsWorkspaceCubit(),
        repository: repository,
      );
      await openTaskCreateForm(tester);
      expect(find.text('Create task'), findsWidgets);

      // A clean form closes at once.
      await tester.tap(_key('task-editor-cancel'));
      await tester.pumpAndSettle();
      expect(_key('task-editor-save'), findsNothing);

      await openTaskCreateForm(tester);
      await tester.enterText(find.byType(EditableText).first, 'Draft task');
      await tester.pump();
      await tester.tap(_key('task-editor-cancel'));
      await tester.pumpAndSettle();
      expect(find.text('Discard changes?'), findsOneWidget);

      await tester.tap(find.text('Keep editing'));
      await tester.pumpAndSettle();
      expect(_key('task-editor-save'), findsOneWidget);
      expect(find.text('Draft task'), findsOneWidget);

      // The sheet's close button asks too; Discard closes the form.
      await tester.tap(_key('app-sheet-close').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Discard'));
      await tester.pumpAndSettle();
      expect(_key('task-editor-save'), findsNothing);
      expect(repository.created, isEmpty);
    });
  });

  group('task detail screen', () {
    testWidgets('the tablet pane renders the sheet sections in two columns', (
      tester,
    ) async {
      tester.view
        ..physicalSize = const Size(1024, 1200)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await pumpRowActionsBoard(
        tester,
        workspaceCubit: rowActionsWorkspaceCubit(),
        repository: repository,
      );
      await tester.tap(find.text('Alpha task').first);
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Open full details'));
      await tester.pumpAndSettle();

      final main = _key('task-detail-main-column');
      final side = _key('task-detail-side-column');
      expect(main, findsOneWidget);
      expect(side, findsOneWidget);
      expect(
        tester.getTopLeft(side).dx,
        greaterThan(tester.getTopRight(main).dx),
      );
      for (final row in [
        'task-quick-list',
        'task-quick-priority',
        'task-quick-assignees',
        'task-quick-start-date',
        'task-quick-due-date',
        'task-quick-labels',
        'task-quick-estimate',
        'task-detail-delete',
      ]) {
        expect(
          find.descendant(of: side, matching: _key(row)),
          findsOneWidget,
          reason: row,
        );
      }
      for (final text in ['Description', 'Relationships']) {
        expect(
          find.descendant(of: main, matching: find.text(text)),
          findsOneWidget,
        );
      }
      expect(_key('task-detail-status-chip'), findsOneWidget);
      // The screen expands nothing further; full details is the sheet's.
      expect(find.byTooltip('Open full details'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  });

  group('relationships empty state', () {
    usePhoneSurface();

    Future<void> openRelationships(WidgetTester tester) async {
      await openQuickActionsSheet(
        tester,
        workspaceCubit: rowActionsWorkspaceCubit(),
        repository: repository,
      );
      final row = _key('kanban-detail-relationships');
      await tester.scrollUntilVisible(
        row,
        200,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.pumpAndSettle();
      await tester.tap(row);
      await tester.pump();
      // Relationships load through the board's cache on real async I/O.
      for (var i = 0; i < 50; i++) {
        if (_key('task-detail-relationships-empty').evaluate().isNotEmpty) {
          return;
        }
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)),
        );
        await tester.pump();
      }
    }

    testWidgets('animates the illustration by default', (tester) async {
      await openRelationships(tester);

      expect(_key('task-detail-relationships-empty'), findsOneWidget);
      expect(find.text('No linked tasks yet'), findsOneWidget);
      expect(find.byType(AppIllustration), findsOneWidget);
      // The drawing plays its passes, then rests.
      final pumps = await tester.pumpAndSettle();
      expect(
        const Duration(milliseconds: 100) * pumps,
        greaterThanOrEqualTo(AppIllustration.period),
      );
    });

    testWidgets('shows the same still state under reduced motion', (
      tester,
    ) async {
      tester.platformDispatcher.accessibilityFeaturesTestValue =
          const FakeAccessibilityFeatures(disableAnimations: true);
      addTearDown(
        tester.platformDispatcher.clearAccessibilityFeaturesTestValue,
      );
      await openRelationships(tester);
      await tester.pump();
      await tester.pump();

      expect(_key('task-detail-relationships-empty'), findsOneWidget);
      expect(find.text('No linked tasks yet'), findsOneWidget);
      expect(find.byType(AppIllustration), findsOneWidget);
      // Nothing moves: the section appears at once and the drawing rests,
      // so the surface settles well within one illustration pass.
      final pumps = await tester.pumpAndSettle();
      expect(
        const Duration(milliseconds: 100) * pumps,
        lessThan(AppIllustration.period),
      );
    });
  });

  group('task detail renders', () {
    setUpAll(DesignRender.loadFonts);

    Future<void> pumpBoard(
      WidgetTester tester,
      AppearanceSettings settings,
      Brightness brightness,
    ) async {
      final router = GoRouter(
        initialLocation: '/tasks/boards/board-1',
        routes: [
          GoRoute(
            path: '/tasks/boards/:boardId',
            builder: (_, _) => TaskBoardDetailPage(
              boardId: 'board-1',
              taskRepository: repository,
            ),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        RepaintBoundary(
          key: DesignRenderApp.boundaryKey,
          child: appearanceTestApp(
            appearance: settings,
            brightness: brightness,
            home: MultiBlocProvider(
              providers: [
                BlocProvider<WorkspaceCubit>.value(
                  value: rowActionsWorkspaceCubit(),
                ),
                BlocProvider(create: (_) => ShellChromeActionsCubit()),
              ],
              // Opening full details reads the route, so the page sits
              // under its own router.
              child: Router.withConfig(config: router),
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
    }

    for (final MapEntry(key: name, value: (settings, brightness))
        in DesignRender.themes.entries) {
      testWidgets('phone sheet $name', (tester) async {
        DesignRender.setSize(tester, DesignRender.sizes['phone']!);
        await pumpBoard(tester, settings, brightness);
        await expandTaskSheet(tester);

        expect(_key('task-quick-list'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await DesignRender.capture(tester, 'task-detail-sheet-phone-$name');
      });

      testWidgets('tablet pane $name', (tester) async {
        DesignRender.setSize(tester, DesignRender.sizes['tablet']!);
        await pumpBoard(tester, settings, brightness);
        await tester.tap(find.byTooltip('Open full details'));
        await tester.pumpAndSettle();

        expect(_key('task-detail-side-column'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await DesignRender.capture(tester, 'task-detail-pane-tablet-$name');
      });
    }
  });
}
