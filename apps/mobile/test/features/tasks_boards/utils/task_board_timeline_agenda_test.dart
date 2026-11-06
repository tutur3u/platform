import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/utils/task_board_timeline_agenda.dart';
import 'package:mobile/features/tasks_boards/utils/task_due_dates.dart';

final _now = DateTime(2026, 10, 27, 15, 30);

DateTime _day(int offset) => DateTime(2026, 10, 27 + offset, 9);

TaskBoardTask _task(
  String id, {
  int? start,
  int? end,
  String? priority,
  String listId = 'list-1',
}) => TaskBoardTask(
  id: id,
  listId: listId,
  name: id,
  priority: priority,
  startDate: start == null ? null : _day(start),
  endDate: end == null ? null : _day(end),
);

TaskTimelineAgenda _build(
  List<TaskBoardTask> tasks, {
  TaskTimelineRange range = TaskTimelineRange.all,
}) => buildTaskTimelineAgenda(tasks: tasks, now: _now, range: range);

List<String> _ids(TaskTimelineDay day) => [
  for (final entry in day.entries) entry.task.id,
];

void main() {
  group('buildTaskTimelineAgenda', () {
    test('places each task once around today', () {
      final agenda = _build([
        _task('overdue', start: -5, end: -2),
        _task('ongoing', start: -3, end: 4),
        _task('today-single', end: 0),
        _task('today-starts', start: 0, end: 2),
        _task('later', start: 3, end: 5),
        _task('later-single', start: 3),
        _task('undated'),
      ]);

      expect(agenda.past.single.day, DateTime(2026, 10, 25));
      expect(
        agenda.past.single.entries.single.placement,
        TaskTimelinePlacement.overdue,
      );
      expect(_ids(agenda.today), ['today-single', 'today-starts', 'ongoing']);
      expect(agenda.today.entries.map((entry) => entry.placement), [
        TaskTimelinePlacement.single,
        TaskTimelinePlacement.starts,
        TaskTimelinePlacement.ongoing,
      ]);
      expect(agenda.upcoming.single.day, DateTime(2026, 10, 30));
      expect(_ids(agenda.upcoming.single), ['later-single', 'later']);
      expect(agenda.unscheduled.map((task) => task.id), ['undated']);
      expect(agenda.hasHiddenLater, isFalse);
    });

    test('a task with only a start date is never overdue', () {
      final agenda = _build([
        _task('started-long-ago', start: -30),
        _task('starts-today', start: 0),
        _task('starts-later', start: 4),
      ]);

      expect(agenda.past, isEmpty);
      final started = agenda.today.entries.firstWhere(
        (entry) => entry.task.id == 'started-long-ago',
      );
      expect(started.placement, TaskTimelinePlacement.open);
      expect(started.hasDue, isFalse);
      expect(started.start, DateTime(2026, 9, 27));
      expect(
        agenda.today.entries
            .firstWhere((entry) => entry.task.id == 'starts-today')
            .placement,
        TaskTimelinePlacement.single,
      );
      expect(agenda.upcoming.single.entries.single.hasDue, isFalse);
    });

    test('days and today follow the user timezone setting', () {
      // 20:00 UTC on Oct 27 is 03:00 on Oct 28 in Ho Chi Minh City.
      final now = DateTime.utc(2026, 10, 27, 20);
      final dueLateUtc = TaskBoardTask(
        id: 'due',
        listId: 'list-1',
        endDate: DateTime.utc(2026, 10, 27, 19),
      );
      final agenda = buildTaskTimelineAgenda(
        tasks: [dueLateUtc],
        now: now,
        range: TaskTimelineRange.all,
        zone: 'Asia/Ho_Chi_Minh',
      );

      expect(agenda.today.day, DateTime(2026, 10, 28));
      expect(
        agenda.today.entries.single.placement,
        TaskTimelinePlacement.single,
      );
      expect(
        taskIsOverdue(
          endDate: dueLateUtc.endDate,
          now: now,
          zone: 'Asia/Ho_Chi_Minh',
        ),
        isFalse,
      );
      expect(
        taskTimeUntilNextDay(now, 'Asia/Ho_Chi_Minh'),
        const Duration(hours: 21),
      );
    });

    test('reversed dates are swapped and spans count calendar days', () {
      final agenda = _build([_task('swapped', start: 2, end: -1)]);
      final entry = agenda.today.entries.single;

      expect(entry.start, DateTime(2026, 10, 26));
      expect(entry.end, DateTime(2026, 10, 29));
      expect(entry.spanDays, 4);
      expect(taskTimelineDayOfSpan(entry, _now), 2);
    });

    test('the range limits upcoming days but never overdue work', () {
      final tasks = [
        _task('overdue', end: -40),
        _task('in-week', start: 6),
        _task('next-week', start: 7),
        _task('next-month', start: 31),
      ];

      final week = _build(tasks, range: TaskTimelineRange.week);
      expect(week.past, hasLength(1));
      expect(week.upcoming.expand(_ids), ['in-week']);
      expect(week.hasHiddenLater, isTrue);

      final month = _build(tasks, range: TaskTimelineRange.month);
      expect(month.upcoming.expand(_ids), ['in-week', 'next-week']);
      expect(month.hasHiddenLater, isTrue);

      final all = _build(tasks);
      expect(all.upcoming.expand(_ids), ['in-week', 'next-week', 'next-month']);
      expect(all.hasHiddenLater, isFalse);
    });

    test(
      'orders overdue days nearest first and rows by deadline, priority',
      () {
        final agenda = _build([
          _task('old', end: -9),
          _task('recent', end: -1),
          _task('b-low', start: 2, priority: 'low'),
          _task('a-normal', start: 2, priority: 'normal'),
          _task('c-critical', start: 2, priority: 'critical'),
          _task('ends-first', start: 2, end: 2),
          _task('ends-later', start: 2, end: 6, priority: 'critical'),
        ]);

        expect(agenda.past.map((day) => day.day.day), [26, 18]);
        expect(_ids(agenda.upcoming.single), [
          'c-critical',
          'a-normal',
          'b-low',
          'ends-first',
          'ends-later',
        ]);
      },
    );

    test('handles a large board in one pass', () {
      final tasks = [
        for (var i = 0; i < 20000; i++)
          _task('t$i', start: i % 400 - 100, end: i % 400 - 98),
      ];
      final agenda = _build(tasks);
      final placed =
          agenda.past.expand((day) => day.entries).length +
          agenda.today.entries.length +
          agenda.upcoming.expand((day) => day.entries).length;
      expect(placed, tasks.length);
    });
  });

  group('TaskTimelineAgendaCache', () {
    final alpha = _task('alpha', start: 1);
    final beta = _task('beta', start: 2);

    test('rebuilds only when tasks, day or range change', () {
      final cache = TaskTimelineAgendaCache();
      TaskTimelineAgenda resolve(
        Map<String, List<TaskBoardTask>> tasks, {
        DateTime? now,
        TaskTimelineRange range = TaskTimelineRange.month,
      }) => cache.resolve(
        listIds: const ['list-1'],
        tasksByList: tasks,
        now: now ?? _now,
        range: range,
      );

      final first = resolve({
        'list-1': [alpha, beta],
      });
      // The board regroups into new collections on every build; the same
      // task objects must reuse the agenda.
      final again = resolve({
        'list-1': [alpha, beta],
      });
      expect(identical(first, again), isTrue);
      expect(
        resolve({
          'list-1': [alpha, beta],
        }, now: _now.add(const Duration(hours: 2))),
        same(first),
      );
      expect(cache.builds, 1);

      resolve({
        'list-1': [alpha, beta.copyWith(name: 'renamed')],
      });
      expect(cache.builds, 2);
      resolve({
        'list-1': [alpha],
      }, range: TaskTimelineRange.week);
      expect(cache.builds, 3);
      resolve(
        {
          'list-1': [alpha],
        },
        range: TaskTimelineRange.week,
        now: _now.add(const Duration(days: 1)),
      );
      expect(cache.builds, 4);
    });

    test('only lists it is given contribute tasks', () {
      final cache = TaskTimelineAgendaCache();
      final agenda = cache.resolve(
        listIds: const ['list-1'],
        tasksByList: {
          'list-1': [alpha],
          'list-done': [_task('done', start: 1, listId: 'list-done')],
        },
        now: _now,
        range: TaskTimelineRange.all,
      );
      expect(agenda.upcoming.expand(_ids), ['alpha']);
    });
  });
}
