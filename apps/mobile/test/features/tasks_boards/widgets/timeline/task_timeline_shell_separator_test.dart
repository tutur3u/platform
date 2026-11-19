import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_view.dart';

import '../../../../helpers/pump_app.dart';

const ValueKey<String> _composite = ValueKey(
  'floating-shell-composite-separator',
);
const ValueKey<String> _timelineHeader = ValueKey('task-timeline-header');

// Wednesday 18 November 2026.
final _now = DateTime(2026, 11, 18, 9);

AnimatedContainer _shellHeader(WidgetTester tester) =>
    tester.widget(find.byKey(const ValueKey('floating-shell-header-surface')));

bool _shellHeaderHairline(WidgetTester tester) {
  final border =
      (_shellHeader(tester).foregroundDecoration! as BoxDecoration).border!
          as Border;
  return border.bottom.color.a > 0;
}

bool _shellHeaderShadow(WidgetTester tester) {
  final decoration = _shellHeader(tester).decoration as BoxDecoration?;
  return decoration?.boxShadow?.isNotEmpty ?? false;
}

/// Edges or shadows the timeline header draws itself.
/// Edges the header draws, not counting the span control's own surface.
Iterable<Element> _timelineHeaderEdges() {
  final control = find
      .descendant(
        of: find.byKey(const ValueKey('task-timeline-span-control')),
        matching: find.byType(DecoratedBox),
      )
      .evaluate()
      .toSet();
  return find
      .descendant(
        of: find.byKey(_timelineHeader),
        matching: find.byWidgetPredicate((widget) {
          if (widget is Divider) return true;
          if (widget is DecoratedBox && widget.decoration is BoxDecoration) {
            final decoration = widget.decoration as BoxDecoration;
            return decoration.border != null ||
                (decoration.boxShadow?.isNotEmpty ?? false);
          }
          return false;
        }),
      )
      .evaluate()
      .where((element) => !control.contains(element));
}

double _dockOpacity(WidgetTester tester) => tester
    .widget<AnimatedOpacity>(
      find.byKey(const ValueKey('floating-shell-dock-opacity')),
    )
    .opacity;

Future<List<bool>> _mount(WidgetTester tester, SorbetTheme? sorbet) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(390, 844);
  addTearDown(tester.view.reset);
  final visibility = <bool>[];
  final controller = ScrollController();
  addTearDown(controller.dispose);
  final tasks = [
    for (var i = 0; i < 40; i++)
      TaskBoardTask(
        id: 'task-$i',
        listId: 'list-1',
        name: 'Task $i',
        startDate: DateTime(2026, 11, 16, 12),
        endDate: DateTime(2026, 11, 20, 12),
      ),
  ];
  await tester.pumpWidget(
    sorbetTestApp(
      sorbet: sorbet,
      brightness: Brightness.dark,
      home: Material(
        child: FloatingShellDock(
          location: '/tasks/boards/board-1',
          bottomInset: 68,
          header: const SizedBox(height: 46, child: Text('Board A')),
          navigation: const SizedBox(width: 160, height: 60),
          onVisibilityChanged: visibility.add,
          child: TaskTimelineView(
            lists: const [
              TaskBoardList(
                id: 'list-1',
                boardId: 'board-1',
                name: 'Todo',
                color: 'BLUE',
              ),
            ],
            tasksByList: {'list-1': tasks},
            hasMoreTasks: false,
            hasLoadError: false,
            isLoadingMoreTasks: false,
            scrollController: controller,
            onLoadMore: () {},
            onTaskTap: (_) async {},
            clock: () => _now,
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return visibility;
}

void main() {
  for (final (design, sorbet) in [
    ('classic', null),
    ('sorbet', const SorbetTheme()),
  ]) {
    testWidgets('$design timeline header: no line at rest, one hairline at '
        'the strip bottom once scrolled, no shadow, dock auto-hides', (
      tester,
    ) async {
      final visibility = await _mount(tester, sorbet);

      expect(find.byKey(_composite), findsNothing);
      expect(_shellHeaderHairline(tester), isFalse);
      expect(_shellHeaderShadow(tester), isFalse);
      expect(_timelineHeaderEdges(), isEmpty);
      expect(_dockOpacity(tester), 1);

      await tester.drag(
        find.byKey(const ValueKey('task-timeline-body')),
        const Offset(0, -300),
      );
      await tester.pump();

      expect(find.byKey(_composite), findsOneWidget);
      expect(
        tester.getRect(find.byKey(_composite)).bottom,
        closeTo(tester.getRect(find.byKey(_timelineHeader)).bottom, 0.01),
      );
      expect(_shellHeaderHairline(tester), isFalse);
      expect(_shellHeaderShadow(tester), isFalse);
      expect(_timelineHeaderEdges(), isEmpty);
      // The body's scroll still reaches the shell: the dock hides.
      expect(visibility, contains(false));
      expect(_dockOpacity(tester), 0);

      await tester.pumpAndSettle(const Duration(seconds: 2));
      tester
          .state<ScrollableState>(
            find.descendant(
              of: find.byKey(const ValueKey('task-timeline-body')),
              matching: find.byType(Scrollable),
            ),
          )
          .position
          .jumpTo(0);
      await tester.pumpAndSettle();
      expect(find.byKey(_composite), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
