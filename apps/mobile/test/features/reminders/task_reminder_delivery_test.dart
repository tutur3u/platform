import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/features/reminders/reminder_notification_copy.dart';
import 'package:mobile/features/reminders/reminder_plan.dart';
import 'package:mobile/features/reminders/task_reminder_delivery.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';

void main() {
  final now = DateTime.utc(2026, 11, 22, 10);

  List<ReminderPlanEntry> plan(
    DateTime time,
    List<UserTask> tasks, {
    String workspace = 'ws',
    Set<String> delivered = const {},
    Set<String> retry = const {},
  }) => buildReminderPlan(
    now: time,
    workspaceId: workspace,
    tasks: tasks,
    events: const [],
    taskOffsets: const ['1h'],
    eventOffsets: const [],
    timezone: 'Asia/Ho_Chi_Minh',
    deliveredTaskKeys: delivered,
    retryPendingTaskKeys: retry,
  );

  UserTask task(String id, int minutes) => UserTask(
    id: id,
    name: id,
    endDate: now.add(Duration(minutes: minutes)),
    list: const TaskListInfo(id: 'list', name: 'Planning'),
  );

  setUpAll(initializeDateFormatting);

  test('keeps personal placements in their authorized source workspace', () {
    final shared = UserTask(
      id: 'shared',
      endDate: now.add(const Duration(hours: 2)),
      list: const TaskListInfo(
        id: 'list',
        board: TaskBoardInfo(id: 'board', wsId: 'shared-workspace'),
      ),
    );
    final scoped = {
      'personal': <String, UserTask?>{},
      'shared-workspace': <String, UserTask?>{},
    };

    collectTaskReminderCandidates(scoped, 'personal', [shared], userId: 'user');
    expect(scoped['personal'], isEmpty);
    expect(scoped['shared-workspace']?.values.single, shared);

    final revised = shared.withDueDate(now.add(const Duration(hours: 3)));
    collectTaskReminderCandidates(scoped, 'shared-workspace', [
      revised,
    ], userId: 'user');
    collectTaskReminderCandidates(scoped, 'personal', [shared], userId: 'user');
    expect(scoped['shared-workspace']?.values.single, revised);

    collectTaskReminderCandidates(
      scoped,
      'shared-workspace',
      const [],
      userId: 'user',
      inactive: [revised],
    );
    collectTaskReminderCandidates(scoped, 'personal', [shared], userId: 'user');
    expect(scoped['shared-workspace']?.values.single, isNull);

    final assigned = UserTask(
      id: 'assigned',
      list: shared.list,
      assignees: const [TaskBoardTaskAssignee(id: 'user')],
    );
    collectTaskReminderCandidates(scoped, 'personal', [
      assigned,
    ], userId: 'user');
    expect(scoped['shared-workspace']?.containsKey(assigned.id), isFalse);

    final withoutMembership = {'personal': <String, UserTask?>{}};
    collectTaskReminderCandidates(withoutMembership, 'personal', [
      shared,
    ], userId: 'user');
    expect(withoutMembership['personal'], isEmpty);
  });

  test('coalesces nearby deadlines without delaying the first alert', () {
    final entries = plan(now, [
      task('First', 66),
      task('Second', 67),
      task('Third', 68),
      task('Fourth', 69),
      task('Later', 71),
    ]);
    final groups = groupReminderEntries([
      ...entries,
      ...plan(now, [task('Other workspace', 67)], workspace: 'other'),
      entries.first,
    ]);
    expect(groups.map((group) => group.length), [4, 1, 1]);
    expect(groups.first.first.scheduledAt, now.add(const Duration(minutes: 6)));
    expect(
      reminderGroupId(groups.first),
      reminderGroupId(groupReminderEntries(entries.reversed).first),
    );
    final copy = reminderGroupCopy(groups.first, AppLocalizationsEn());
    expect(copy.title, '4 tasks due soon');
    expect(copy.body, contains('First — Due in 1 hour'));
    expect(copy.body, contains('Planning'));
    expect(copy.body, contains('+1 more'));
    expect(copy.body, isNot(contains('Fourth')));
  });

  test('replans the active member of a canceled delayed group', () {
    final first = task('First', 66);
    final second = task('Second', 68);
    final group = groupReminderEntries(plan(now, [first, second])).single;
    final id = reminderGroupId(group);
    final elapsed = {
      for (final entry in group)
        entry.taskReceiptKey: (
          notificationId: id,
          at: group.first.scheduledAt,
          retry: false,
        ),
    };
    final later = now.add(const Duration(minutes: 10));
    expect(
      reconcileDelayedTaskReminders(
        elapsed: elapsed.entries,
        eligibleTasks: {
          'ws': [first, second],
        },
        offsets: const ['1h'],
        pendingIds: {id},
        now: later,
      ).retain,
      {id},
    );

    final partial = reconcileDelayedTaskReminders(
      elapsed: elapsed.entries,
      eligibleTasks: {
        'ws': [second],
      },
      offsets: const ['1h'],
      pendingIds: {id},
      now: later,
    );
    expect(partial.retain, isEmpty);
    expect(partial.retry, {group.last.taskReceiptKey});
    expect(
      plan(later, [second], retry: partial.retry).single.scheduledAt,
      later.add(const Duration(seconds: 10)),
    );
  });

  test('a persisted replacement intent fences the whole old group', () {
    final first = task('Reopened', 66);
    final second = task('Active', 68);
    final group = groupReminderEntries(plan(now, [first, second])).single;
    final id = reminderGroupId(group);
    final elapsed = {
      for (final entry in group)
        entry.taskReceiptKey: (
          notificationId: id,
          at: group.first.scheduledAt,
          retry: entry.entityId == second.id,
        ),
    };
    final later = now.add(const Duration(minutes: 10));
    final reconciliation = reconcileDelayedTaskReminders(
      elapsed: elapsed.entries,
      eligibleTasks: {
        'ws': [first, second],
      },
      offsets: const ['1h'],
      pendingIds: {id},
      now: later,
    );
    expect(reconciliation.retain, isEmpty);
    expect(reconciliation.cancel, {id});
    expect(reconciliation.retry, elapsed.keys.toSet());
  });

  test('a canceled member remains retryable through a failed replacement', () {
    final active = task('active', 66);
    final entry = plan(now, [active]).single;
    final stored = encodeTaskReminderReceipts({
      entry.taskReceiptKey: (
        notificationId: entry.notificationId,
        at: entry.scheduledAt,
        retry: true,
      ),
    });
    final relaunch = now.add(const Duration(minutes: 20));
    final receipts = readTaskReminderReceipts(stored, relaunch);
    final retrying = receipts.entries
        .where((entry) => entry.value.retry)
        .map((entry) => entry.key)
        .toSet();
    expect(
      plan(relaunch, [active], retry: retrying).single.scheduledAt,
      relaunch.add(const Duration(seconds: 10)),
    );
  });

  test(
    'revised deadlines receive distinct platform notification identities',
    () {
      final original = plan(now, [task('Moved', 66)]).single;
      final revised = plan(now, [task('Moved', 120)]).single;
      expect(revised.notificationId, isNot(original.notificationId));
      expect(revised.taskReceiptKey, isNot(original.taskReceiptKey));
    },
  );

  test('one elapsed overdue receipt survives replanning and a restart', () {
    final overdue = task('Overdue', -10);
    final entry = plan(now, [overdue]).single;
    final persisted = encodeTaskReminderReceipts({
      entry.taskReceiptKey: (
        notificationId: entry.notificationId,
        at: entry.scheduledAt,
        retry: false,
      ),
    });
    final restartedAt = now.add(const Duration(minutes: 5));
    final receipts = readTaskReminderReceipts(persisted, restartedAt);
    final delivered = receipts.entries
        .where((entry) => !entry.value.at.isAfter(restartedAt))
        .map((entry) => entry.key)
        .toSet();
    expect(plan(restartedAt, [overdue], delivered: delivered), isEmpty);
    final moved = task('Overdue', 120);
    expect(
      plan(restartedAt, [
        moved,
      ], delivered: receipts.keys.toSet()).single.offset,
      '1h',
    );
    expect(
      readTaskReminderReceipts(persisted, now.add(taskOverdueWindow)),
      isEmpty,
    );
  });
}
