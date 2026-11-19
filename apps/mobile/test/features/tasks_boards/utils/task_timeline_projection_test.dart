import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/utils/task_timeline_projection.dart';
import 'package:mobile/features/tasks_boards/utils/task_timeline_window.dart';

// Wednesday 18 November 2026.
final _today = DateTime(2026, 11, 18);

DateTime _at(int dayOffset) =>
    DateTime(_today.year, _today.month, _today.day + dayOffset, 12);

TaskBoardTask _task(
  String id,
  String listId, {
  int? start,
  int? end,
  bool completed = false,
}) => TaskBoardTask(
  id: id,
  listId: listId,
  name: id,
  completed: completed,
  startDate: start == null ? null : _at(start),
  endDate: end == null ? null : _at(end),
);

const _lists = [
  TaskBoardList(id: 'product', boardId: 'b', name: 'Product', color: 'BLUE'),
  TaskBoardList(id: 'design', boardId: 'b', name: 'Design', color: 'PURPLE'),
  TaskBoardList(id: 'review', boardId: 'b', name: 'Review', status: 'review'),
  TaskBoardList(id: 'done', boardId: 'b', name: 'Done', status: 'done'),
];

TaskTimelineProjection _project(
  List<TaskBoardTask> tasks, {
  TaskTimelineWindow? window,
}) {
  final byList = <String, List<TaskBoardTask>>{};
  for (final task in tasks) {
    byList.putIfAbsent(task.listId, () => []).add(task);
  }
  return buildTaskTimelineProjection(
    lists: _lists,
    tasksByList: byList,
    window: window ?? TaskTimelineWindow.around(TaskTimelineSpan.week, _today),
    today: _today,
  );
}

List<String> _ids(TaskTimelineProjection projection) => [
  for (final row in projection.rows)
    ...switch (row) {
      TaskTimelineCaption(isOverdue: true) => ['overdue'],
      TaskTimelineCaption(:final listId) => ['[$listId]'],
      TaskTimelineLane(:final bars) => bars.map((bar) => bar.task.id),
      TaskTimelineBar(:final task) => [task.id],
    },
];

TaskTimelineBar _bar(TaskTimelineProjection projection, String id) => projection
    .rows
    .expand(
      (row) => switch (row) {
        TaskTimelineCaption() => const <TaskTimelineBar>[],
        TaskTimelineLane(:final bars) => bars,
        TaskTimelineBar() => [row],
      },
    )
    .firstWhere((bar) => bar.task.id == id);

void main() {
  group('TaskTimelineWindow', () {
    test('weeks start on Monday and months on the 1st', () {
      final week = TaskTimelineWindow.around(TaskTimelineSpan.week, _today);
      expect(week.start, DateTime(2026, 11, 16));
      expect(week.days, 7);
      final two = TaskTimelineWindow.around(TaskTimelineSpan.twoWeeks, _today);
      expect(two.end, DateTime(2026, 11, 29));
      final month = TaskTimelineWindow.around(TaskTimelineSpan.month, _today);
      expect(month.start, DateTime(2026, 11));
      expect(month.days, 30);
    });

    test('shifts by whole spans and centres on a day', () {
      final week = TaskTimelineWindow.around(TaskTimelineSpan.week, _today);
      expect(week.shift(1).start, DateTime(2026, 11, 23));
      expect(week.shift(-1).start, DateTime(2026, 11, 9));
      final month = TaskTimelineWindow.around(TaskTimelineSpan.month, _today);
      expect(month.shift(1).start, DateTime(2026, 12));
      expect(month.shift(1).days, 31);
      final centred = TaskTimelineWindow.centredOn(
        TaskTimelineSpan.week,
        DateTime(2026, 11, 21),
      );
      expect(centred.dayAt(3), DateTime(2026, 11, 21));
      expect(centred.contains(_today), isTrue);
    });
  });

  group('buildTaskTimelineProjection', () {
    test('bars cover the columns of their days, clamped to the window', () {
      final projection = _project([
        _task('span', 'product', start: -1, end: 1),
        _task('long', 'product', start: -10, end: 30),
        _task('later', 'product', start: 20, end: 21),
      ]);
      final span = _bar(projection, 'span');
      expect((span.firstColumn, span.lastColumn), (1, 3));
      final long = _bar(projection, 'long');
      expect((long.firstColumn, long.lastColumn), (0, 6));
      expect(_ids(projection), isNot(contains('later')));
    });

    test('groups by list in board order with overdue first', () {
      final projection = _project([
        _task('design-a', 'design', start: 0, end: 1),
        _task('product-b', 'product', start: 2, end: 3),
        _task('product-a', 'product', start: 0, end: 0),
        _task('late-2', 'design', start: -4, end: -2),
        _task('late-1', 'product', end: -1),
      ]);
      expect(_ids(projection), [
        'overdue',
        'late-1',
        'late-2',
        '[product]',
        'product-a',
        'product-b',
        '[design]',
        'design-a',
      ]);
      expect(
        projection.rows.whereType<TaskTimelineLane>().map(
          (lane) => lane.bars.length,
        ),
        [2, 2, 1],
      );
      final caption = projection.rows.first as TaskTimelineCaption;
      expect(caption.overdueCount, 2);
      expect(_bar(projection, 'late-1').daysLate, 1);
      expect(_bar(projection, 'late-2').daysLate, 2);
      // Due Monday, two days late: the bar stops on its due column.
      expect(_bar(projection, 'late-2').lastColumn, 0);
    });

    test('done work is faded, never overdue; review keeps no deadline', () {
      final projection = _project([
        _task('closed', 'product', end: -3, completed: true),
        _task('shipped', 'done', start: -1, end: 0),
        _task('in-review', 'review', end: -1),
      ]);
      expect(_ids(projection), isNot(contains('overdue')));
      expect(_bar(projection, 'shipped').done, isTrue);
      expect(_bar(projection, 'in-review').overdue, isFalse);
      expect(_ids(projection), isNot(contains('closed')));
    });

    test('a start-only open task runs through today', () {
      final bar = _bar(
        _project([_task('started', 'product', start: -2)]),
        'started',
      );
      expect((bar.firstColumn, bar.lastColumn), (0, 2));
      expect(bar.overdue, isFalse);
    });

    test('overdue groups only while the window holds today', () {
      final next = TaskTimelineWindow.around(
        TaskTimelineSpan.week,
        _today,
      ).shift(1);
      final projection = _project([
        _task('late', 'product', end: -1),
        _task('next', 'product', start: 7, end: 8),
      ], window: next);
      expect(_ids(projection), ['[product]', 'next']);
    });

    test('counts open tasks without dates', () {
      final projection = _project([
        _task('a', 'product'),
        _task('b', 'design'),
        _task('c', 'done'),
      ]);
      expect(projection.isEmpty, isTrue);
      expect(projection.undatedCount, 2);
    });
  });

  test('the cache rebuilds only when tasks, window or day change', () {
    final cache = TaskTimelineProjectionCache();
    final task = _task('a', 'product', start: 0, end: 1);
    final window = TaskTimelineWindow.around(TaskTimelineSpan.week, _today);
    TaskTimelineProjection resolve(TaskTimelineWindow window) => cache.resolve(
      lists: _lists,
      tasksByList: {
        'product': [task],
      },
      window: window,
      today: _today,
    );
    final first = resolve(window);
    expect(identical(resolve(window), first), isTrue);
    expect(cache.builds, 1);
    resolve(window.shift(1));
    expect(cache.builds, 2);
  });
}
