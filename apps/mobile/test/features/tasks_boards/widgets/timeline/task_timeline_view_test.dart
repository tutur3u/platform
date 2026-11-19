import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/utils/task_timeline_window.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_caption_row.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_grid_painter.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_rows.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_view.dart';

import '../../../../helpers/helpers.dart';
import '../../../../helpers/phone_surface.dart';

// Wednesday 18 November 2026; the week runs Monday 16 to Sunday 22.
final _now = DateTime(2026, 11, 18, 9);
final _today = DateTime(2026, 11, 18);

TaskTimelineWindow get _week =>
    TaskTimelineWindow.around(TaskTimelineSpan.week, _today);

/// Noon of the current week's [column] (0 is Monday).
DateTime _weekDay(int column) {
  final day = _week.dayAt(column);
  return DateTime(day.year, day.month, day.day, 12);
}

DateTime _offset(int days) =>
    DateTime(_today.year, _today.month, _today.day + days, 12);

const _lists = [
  TaskBoardList(id: 'product', boardId: 'b', name: 'Product', color: 'BLUE'),
  TaskBoardList(id: 'design', boardId: 'b', name: 'Design', color: 'PURPLE'),
  TaskBoardList(id: 'ops', boardId: 'b', name: 'Operations', color: 'GREEN'),
];

TaskBoardTask _task(
  String id,
  String listId, {
  DateTime? start,
  DateTime? end,
  bool completed = false,
}) => TaskBoardTask(
  id: id,
  listId: listId,
  name: id,
  startDate: start,
  endDate: end,
  completed: completed,
);

Finder _key(String key) => find.byKey(ValueKey(key));

String _dayKey(DateTime day) =>
    'task-timeline-day-${DateFormat('yyyy-MM-dd').format(day)}';

class _Harness {
  final List<TaskBoardTask> tapped = [];
  int undatedOpened = 0;

  Future<void> pump(
    WidgetTester tester,
    List<TaskBoardTask> tasks, {
    ThemeMode? themeMode,
    bool settle = true,
  }) async {
    final byList = <String, List<TaskBoardTask>>{};
    for (final task in tasks) {
      byList.putIfAbsent(task.listId, () => []).add(task);
    }
    final controller = ScrollController();
    addTearDown(controller.dispose);
    await tester.pumpApp(
      TaskTimelineView(
        lists: _lists,
        tasksByList: byList,
        hasMoreTasks: false,
        hasLoadError: false,
        isLoadingMoreTasks: false,
        scrollController: controller,
        onLoadMore: () {},
        onTaskTap: (task) async => tapped.add(task),
        onShowUndated: () => undatedOpened += 1,
        clock: () => _now,
      ),
      themeMode: themeMode,
    );
    if (settle) await tester.pumpAndSettle();
  }
}

bool _insideTimelineLane(Element element) {
  var inside = false;
  element.visitAncestorElements((ancestor) {
    if (ancestor.widget is TaskTimelineLaneRow) {
      inside = true;
      return false;
    }
    return true;
  });
  return inside;
}

/// Rows built for task captions and bars, in order.
List<String> _rowOrder(WidgetTester tester) {
  final ordered = <String>[];
  for (final element
      in find
          .byWidgetPredicate(
            (widget) =>
                widget is TaskTimelineCaptionRow ||
                widget is TaskTimelineLaneRow ||
                widget is TaskTimelineBarRow,
          )
          .evaluate()) {
    switch (element.widget) {
      case TaskTimelineCaptionRow(:final label):
        ordered.add('[$label]');
      case TaskTimelineLaneRow(:final bars):
        ordered.add(bars.map((bar) => bar.task.id).join(','));
      case TaskTimelineBarRow(:final bar):
        if (!_insideTimelineLane(element)) ordered.add(bar.task.id);
      default:
        break;
    }
  }
  return ordered;
}

void main() {
  group('task timeline on a phone', () {
    usePhoneSurface();

    testWidgets('the header draws no edge or shadow of its own', (
      tester,
    ) async {
      await _Harness().pump(tester, [
        _task('a', 'product', start: _weekDay(0), end: _weekDay(1)),
      ]);

      // The shell draws the single hairline below the strip once the body
      // scrolls (task_timeline_shell_separator_test.dart). The span control's
      // own surface is not a header edge.
      final control = find
          .descendant(
            of: _key('task-timeline-span-control'),
            matching: find.byType(DecoratedBox),
          )
          .evaluate()
          .toSet();
      final edges = find.descendant(
        of: _key('task-timeline-header'),
        matching: find.byWidgetPredicate(
          (widget) =>
              widget is Divider ||
              widget is Material && widget.elevation > 0 ||
              (widget is DecoratedBox &&
                  widget.decoration is BoxDecoration &&
                  ((widget.decoration as BoxDecoration).border != null ||
                      ((widget.decoration as BoxDecoration)
                              .boxShadow
                              ?.isNotEmpty ??
                          false))),
        ),
      );
      expect(
        edges.evaluate().where((element) => !control.contains(element)),
        isEmpty,
      );
      expect(find.text('Today'), findsNothing);
    });

    testWidgets('bars span the columns of their days', (tester) async {
      await _Harness().pump(tester, [
        _task('span', 'product', start: _weekDay(1), end: _weekDay(3)),
      ]);

      final bar = tester.getRect(_key('task-timeline-bar-span'));
      final first = tester.getRect(_key(_dayKey(_week.dayAt(1))));
      final last = tester.getRect(_key(_dayKey(_week.dayAt(3))));
      expect(bar.left, moreOrLessEquals(first.left + 1, epsilon: 0.5));
      expect(bar.right, moreOrLessEquals(last.right - 1, epsilon: 0.5));
      expect(bar.height, TaskTimelineBarRow.thinBarHeight);
      // The title sits above its bar.
      expect(tester.getRect(find.text('span')).bottom, lessThan(bar.top));
    });

    testWidgets('groups bars by list in board order, overdue first', (
      tester,
    ) async {
      await _Harness().pump(tester, [
        _task('ops-a', 'ops', start: _weekDay(4), end: _weekDay(5)),
        _task('design-a', 'design', start: _weekDay(2), end: _weekDay(2)),
        _task('product-b', 'product', start: _weekDay(3), end: _weekDay(4)),
        _task('product-a', 'product', start: _weekDay(0), end: _weekDay(6)),
        _task('late-two', 'design', end: _offset(-2)),
        _task('late-one', 'product', start: _offset(-3), end: _offset(-1)),
      ]);

      expect(_rowOrder(tester), [
        '[Overdue 2]',
        'late-one',
        'late-two',
        '[Product]',
        'product-a',
        'product-b',
        '[Design]',
        'design-a',
        '[Operations]',
        'ops-a',
      ]);
      expect(find.text('1d'), findsOneWidget);
      expect(find.text('2d'), findsOneWidget);
      final lateBar = tester.widget<TaskTimelineBarRow>(
        find.ancestor(
          of: find.text('late-one'),
          matching: find.byType(TaskTimelineBarRow),
        ),
      );
      expect(lateBar.bar.overdue, isTrue);
      final barBox = tester.widget<Container>(
        _key('task-timeline-bar-late-one'),
      );
      expect(
        (barBox.decoration! as BoxDecoration).color,
        AppTokens.of(
          tester.element(_key('task-timeline-bar-late-one')),
        ).colorScheme.destructive,
      );
    });

    testWidgets('done tasks fade with a strike-through', (tester) async {
      await _Harness().pump(tester, [
        _task(
          'icon set',
          'design',
          start: _weekDay(0),
          end: _weekDay(1),
          completed: true,
        ),
      ]);

      final title = tester.widget<Text>(find.text('icon set'));
      expect(title.style?.decoration, TextDecoration.lineThrough);
      final fade = tester.widget<Opacity>(
        find
            .ancestor(of: find.text('icon set'), matching: find.byType(Opacity))
            .first,
      );
      expect(fade.opacity, lessThan(1));
    });

    testWidgets('marks today in the strip and the grid', (tester) async {
      await _Harness().pump(tester, [
        _task('a', 'product', start: _weekDay(0), end: _weekDay(6)),
      ]);

      final painter =
          tester.widget<CustomPaint>(_key('task-timeline-grid')).painter!
              as TaskTimelineGridPainter;
      expect(painter.todayColumn, _week.columnOf(_today));
      final circle = find.descendant(
        of: _key(_dayKey(_today)),
        matching: find.byWidgetPredicate(
          (widget) =>
              widget is Container &&
              widget.decoration is BoxDecoration &&
              (widget.decoration! as BoxDecoration).shape == BoxShape.circle,
        ),
      );
      expect(circle, findsOneWidget);
      expect(_key('task-timeline-today-button'), findsNothing);
    });

    testWidgets('swiping the strip leaves the week; Today returns', (
      tester,
    ) async {
      await _Harness().pump(tester, [
        _task('a', 'product', start: _weekDay(0), end: _weekDay(6)),
      ]);

      await tester.fling(
        _key('task-timeline-day-strip'),
        const Offset(-200, 0),
        800,
      );
      await tester.pumpAndSettle();
      expect(_key(_dayKey(_today)), findsNothing);
      expect(_key('task-timeline-today-button'), findsOneWidget);

      await tester.tap(_key('task-timeline-today-button'));
      await tester.pumpAndSettle();
      expect(_key(_dayKey(_today)), findsOneWidget);
      expect(_key('task-timeline-today-button'), findsNothing);
    });

    testWidgets('tapping a day centres the window on it', (tester) async {
      await _Harness().pump(tester, const []);
      final sunday = _week.dayAt(6);

      await tester.tap(_key(_dayKey(sunday)));
      await tester.pumpAndSettle();

      final strip = tester.getRect(_key('task-timeline-day-strip'));
      final cell = tester.getRect(_key(_dayKey(sunday)));
      expect(cell.center.dx, moreOrLessEquals(strip.center.dx, epsilon: 1));
    });

    testWidgets('an empty week offers the undated tasks', (tester) async {
      final harness = _Harness();
      await harness.pump(tester, [
        _task('undated-a', 'product'),
        _task('undated-b', 'design'),
        _task('next-month', 'ops', start: _offset(40), end: _offset(41)),
      ]);

      expect(find.text('Nothing scheduled this week'), findsOneWidget);
      await tester.tap(find.text('2 tasks without dates'));
      await tester.pumpAndSettle();
      expect(harness.undatedOpened, 1);
    });

    testWidgets('the span control switches week, 2 weeks and month', (
      tester,
    ) async {
      await _Harness().pump(tester, const []);
      Finder cells() => find.byWidgetPredicate(
        (widget) =>
            widget.key is ValueKey<String> &&
            (widget.key! as ValueKey<String>).value.startsWith(
              'task-timeline-day-2',
            ),
      );
      AppSegmentedControl<TaskTimelineSpan> control() =>
          tester.widget<AppSegmentedControl<TaskTimelineSpan>>(
            _key('task-timeline-span-control'),
          );
      String range() =>
          tester.widget<Text>(_key('task-timeline-range-label')).data!;

      expect(control().selected, TaskTimelineSpan.week);
      expect(range(), 'Nov 16 – 22');
      expect(cells(), findsNWidgets(7));
      expect(
        tester.getSize(find.text('Week')).height,
        lessThan(tester.getSize(_key('task-timeline-span-control')).height),
      );
      expect(
        tester.getSize(_key('task-timeline-span-control')).height,
        greaterThanOrEqualTo(44),
      );

      Future<void> pick(String label) async {
        await tester.tap(
          find.descendant(
            of: _key('task-timeline-span-control'),
            matching: find.text(label),
          ),
        );
        await tester.pumpAndSettle();
      }

      await pick('2 weeks');
      expect(control().selected, TaskTimelineSpan.twoWeeks);
      expect(range(), 'Nov 16 – 29');
      expect(cells(), findsNWidgets(14));
      await pick('Month');
      expect(control().selected, TaskTimelineSpan.month);
      expect(range(), 'Nov 1 – 30');
      expect(
        cells(),
        findsNWidgets(
          TaskTimelineWindow.around(TaskTimelineSpan.month, _today).days,
        ),
      );
      expect(find.text('Nothing scheduled this month'), findsOneWidget);
      await pick('Week');
      expect(control().selected, TaskTimelineSpan.week);
      expect(cells(), findsNWidgets(7));
    });

    testWidgets('the span control follows the theme in light and dark', (
      tester,
    ) async {
      final tracks = <Color?>[];
      for (final mode in [ThemeMode.light, ThemeMode.dark]) {
        await _Harness().pump(tester, const [], themeMode: mode);
        final control = _key('task-timeline-span-control');
        final colors = AppTokens.of(tester.element(control)).colorScheme;
        final track = tester.widget<DecoratedBox>(
          find
              .descendant(of: control, matching: find.byType(DecoratedBox))
              .first,
        );
        final color = (track.decoration as BoxDecoration).color;
        expect(color, colors.muted.withValues(alpha: 0.8), reason: '$mode');
        expect(
          tester.widget<Text>(_key('task-timeline-range-label')).style?.color,
          colors.foreground,
          reason: '$mode',
        );
        tracks.add(color);
      }
      expect(tracks.first, isNot(tracks.last));
    });

    testWidgets('the empty range illustration animates, and holds a still '
        'pose under reduced motion', (tester) async {
      for (final reduceMotion in [false, true]) {
        tester.platformDispatcher.accessibilityFeaturesTestValue =
            FakeAccessibilityFeatures(disableAnimations: reduceMotion);
        await _Harness().pump(tester, const [], settle: false);
        await tester.pump(AppIllustration.period ~/ 4);

        final illustration = tester.widget<AppIllustration>(
          find.byType(AppIllustration),
        );
        expect(illustration.kind, AppIllustrationKind.calendarFree);
        expect(illustration.cycles, greaterThan(0));
        expect(find.text('Nothing scheduled this week'), findsOneWidget);
        expect(
          tester.binding.hasScheduledFrame,
          !reduceMotion,
          reason: reduceMotion ? 'reduced motion' : 'default motion',
        );
        await tester.pumpWidget(const SizedBox.shrink());
      }
      tester.platformDispatcher.clearAccessibilityFeaturesTestValue();
    });

    testWidgets('tapping a task opens it', (tester) async {
      final harness = _Harness();
      await harness.pump(tester, [
        _task('open me', 'product', start: _weekDay(2), end: _weekDay(3)),
      ]);

      await tester.tap(_key('task-timeline-row-open me'));
      expect(harness.tapped.single.id, 'open me');
    });
  });

  group('task timeline on a tablet', () {
    usePhoneSurface(size: const Size(834, 1194));

    testWidgets('shows two weeks with titles inside tall bars', (tester) async {
      final two = TaskTimelineWindow.around(TaskTimelineSpan.twoWeeks, _today);
      DateTime day(int column) {
        final date = two.dayAt(column);
        return DateTime(date.year, date.month, date.day, 12);
      }

      await _Harness().pump(tester, [
        _task('long', 'product', start: day(7), end: day(10)),
        _task('short', 'design', start: day(2), end: day(2)),
      ]);

      expect(_key(_dayKey(two.dayAt(13))), findsOneWidget);
      final long = tester.getRect(_key('task-timeline-bar-long'));
      expect(long.height, TaskTimelineBarRow.tallBarHeight);
      final title = tester.getRect(find.text('long'));
      expect(long.contains(title.center), isTrue);
      final short = tester.getRect(_key('task-timeline-bar-short'));
      expect(
        short.contains(tester.getRect(find.text('short')).center),
        isFalse,
      );
    });
  });
}
