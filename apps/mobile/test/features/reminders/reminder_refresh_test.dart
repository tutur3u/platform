import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/data/models/user_tasks_page.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/reminders/reminder_service.dart';
import 'package:mobile/features/reminders/reminder_timezone_resolver.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Tasks extends Mock implements TaskRepository {}

class _Calendar extends Mock implements CalendarRepository {}

class _Settings extends Mock implements SettingsRepository {}

class _Push extends Mock implements PushNotificationService {}

class _Zones extends Mock implements TimezoneSettingsRepository {
  @override
  Future<String> readPersonal(
    String userId, {
    Duration timeout = const Duration(seconds: 15),
  }) async => 'UTC';

  @override
  Future<String> readWorkspace(
    String userId,
    String id, {
    Duration timeout = const Duration(seconds: 15),
  }) async => 'auto';
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final now = DateTime.utc(2026, 11, 25, 12);
  const receiptKey = 'reminders.actor.taskReceipts';
  const idsKey = 'reminders.actor.scheduledIds';
  late ReminderService service;
  late SharedPreferences store;
  late List<UserTask> tasks;
  late List<int> canceled;
  late List<PushNavigationRequest> requests;
  late bool failSchedule;
  late bool foreground;
  late int overdueShown;

  setUpAll(() {
    registerFallbackValue(now);
    registerFallbackValue(
      const PushNavigationRequest(notificationId: '', openTarget: 'tasks'),
    );
    registerFallbackValue(() => false);
  });

  setUp(() async {
    await CacheStore.instance.clearScope();
    SharedPreferences.setMockInitialValues({
      'reminders.actor.eventOffsets': <String>[],
      'reminders.actor.eventsEnabled': false,
      'reminders.actor.taskOffsets': ['1h'],
      idsKey: ['42'],
    });
    store = await SharedPreferences.getInstance();
    tasks = [];
    canceled = [];
    requests = [];
    failSchedule = false;
    foreground = false;
    overdueShown = 0;
    final repository = _Tasks();
    final notifications = _Push();
    final settings = _Settings();
    final resolver = ReminderTimezoneResolver(
      repository: _Zones(),
      deviceLoader: () async => 'UTC',
    );
    when(settings.getLocale).thenAnswer((_) async => 'en');
    when(
      () => repository.getMyTasks(wsId: 'workspace', isPersonal: false),
    ).thenAnswer(
      (_) async => UserTasksPage(
        overdue: tasks.where((task) => task.endDate!.isBefore(now)).toList(),
        today: tasks.where((task) => task.endDate!.isAfter(now)).toList(),
        upcoming: const [],
        completed: const [],
        totalActiveTasks: tasks.length,
        totalCompletedTasks: 0,
        hasMoreCompleted: false,
        completedPage: 0,
      ),
    );
    when(notifications.pendingLocalReminderIds).thenAnswer((_) async => {42});
    when(
      () => notifications.notificationsEnabled,
    ).thenAnswer((_) async => true);
    when(() => notifications.cancelLocalReminder(any())).thenAnswer((
      call,
    ) async {
      canceled.add(call.positionalArguments.single as int);
    });
    when(
      () => notifications.scheduleLocalReminder(
        id: any(named: 'id'),
        scheduledAt: any(named: 'scheduledAt'),
        title: any(named: 'title'),
        body: any(named: 'body'),
        request: any(named: 'request'),
        grouped: true,
      ),
    ).thenAnswer((call) async {
      expect(store.getStringList(receiptKey), hasLength(2));
      if (failSchedule) throw StateError('Native schedule failed');
      requests.add(call.namedArguments[#request] as PushNavigationRequest);
    });
    when(
      () => notifications.showOverdueReminder(
        id: any(named: 'id'),
        title: any(named: 'title'),
        body: any(named: 'body'),
        request: any(named: 'request'),
        isForeground: any(named: 'isForeground'),
        grouped: false,
      ),
    ).thenAnswer((call) async {
      overdueShown++;
      return true;
    });
    service = ReminderService(
      timezoneResolver: resolver,
      taskRepository: repository,
      calendarRepository: _Calendar(),
      notifications: notifications,
      settingsRepository: settings,
      now: () => now,
      isForeground: () => foreground,
    );
    addTearDown(service.dispose);
    addTearDown(resolver.dispose);
  });

  Future<void> start() => service.startSession('actor', const [
    Workspace(id: 'workspace', name: 'Test workspace'),
  ]);

  test('cancels stale IDs and persists both receipts for one group', () async {
    tasks = [
      UserTask(id: 'first', endDate: now.add(const Duration(hours: 2))),
      UserTask(id: 'second', endDate: now.add(const Duration(hours: 2))),
    ];
    await start();

    expect(service.status.error, isNull);
    expect(canceled, [42]);
    expect(requests.single.openTarget, 'tasks');
    expect(requests.single.userId, 'actor');
    expect(requests.single.wsId, 'workspace');
    expect(requests.single.entityId, isNull);
    final id = store.getStringList(idsKey)!.single;
    expect(id, isNot('42'));
    final receipts = store.getStringList(receiptKey)!;
    expect(receipts, hasLength(2));
    expect(receipts, everyElement(endsWith(' $id scheduled')));
  });

  test('rolls back failed native schedules and retries on refresh', () async {
    tasks = [
      UserTask(id: 'first', endDate: now.add(const Duration(hours: 2))),
      UserTask(id: 'second', endDate: now.add(const Duration(hours: 2))),
    ];
    failSchedule = true;
    await start();

    expect(service.status.error, contains('Native schedule failed'));
    expect(store.getStringList(receiptKey), isEmpty);
    expect(requests, isEmpty);

    failSchedule = false;
    await service.refresh();
    expect(service.status.error, isNull);
    expect(requests, hasLength(1));
    expect(store.getStringList(receiptKey), hasLength(2));
  });

  test(
    'foreground skips leaving overdue receipt eligible for background',
    () async {
      tasks = [
        UserTask(id: 'late', endDate: now.subtract(const Duration(hours: 1))),
      ];
      foreground = true;
      await start();

      expect(service.status.error, isNull);
      expect(overdueShown, 0);
      expect(store.getStringList(receiptKey), isEmpty);

      foreground = false;
      await service.refreshAfterBackgrounding();
      expect(overdueShown, 1);
      expect(store.getStringList(receiptKey), hasLength(1));
      expect(store.getStringList(idsKey), isEmpty);

      await service.refresh();
      expect(overdueShown, 1);
    },
  );
}
