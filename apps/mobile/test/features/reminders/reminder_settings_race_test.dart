import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/reminders/reminder_service.dart';
import 'package:mobile/features/reminders/reminder_settings.dart';
import 'package:mobile/features/reminders/reminder_timezone_resolver.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Calendar extends Mock implements CalendarRepository {}

class _Settings extends Mock implements SettingsRepository {}

class _Notifications extends Mock implements PushNotificationService {}

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

class _HeldSettings extends ReminderSettings {
  const _HeldSettings(this.entered, this.release)
    : super(tasksEnabled: false, eventsEnabled: false);
  final Completer<void> entered;
  final Completer<void> release;
  @override
  Future<void> save(String userId) async {
    entered.complete();
    await release.future;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() {
    registerFallbackValue(DateTime.utc(2026));
    registerFallbackValue(
      const PushNavigationRequest(
        notificationId: 'fixture',
        openTarget: 'calendar',
      ),
    );
  });
  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'reminders.user.tasksEnabled': false,
      'reminders.user.eventOffsets': ['1d'],
    });
    CalendarCubit.clearCache();
    await CacheStore.instance.clearScope();
  });

  Future<
    ({
      ReminderService service,
      _Settings settings,
      _Notifications notifications,
      Set<int> pending,
    })
  >
  fixture({
    Future<String?> Function()? locale,
    Future<void> Function(int)? schedule,
    bool twoEvents = false,
  }) async {
    final calendar = _Calendar();
    final settings = _Settings();
    final notifications = _Notifications();
    final pending = <int>{};
    when(
      settings.getLocale,
    ).thenAnswer((_) => locale?.call() ?? Future.value('en'));
    when(
      notifications.pendingLocalReminderIds,
    ).thenAnswer((_) async => pending);
    when(
      () => notifications.notificationsEnabled,
    ).thenAnswer((_) async => true);
    when(
      () => calendar.getEvents(
        any(),
        start: any(named: 'start'),
        end: any(named: 'end'),
      ),
    ).thenAnswer(
      (_) async => [
        CalendarEvent(
          id: 'first',
          title: 'Synthetic first',
          startAt: DateTime.utc(2026, 10, 2),
          endAt: DateTime.utc(2026, 10, 3),
        ),
        if (twoEvents)
          CalendarEvent(
            id: 'second',
            title: 'Synthetic second',
            startAt: DateTime.utc(2026, 10, 3),
            endAt: DateTime.utc(2026, 10, 4),
          ),
      ],
    );
    when(
      () => notifications.scheduleLocalReminder(
        id: any(named: 'id'),
        scheduledAt: any(named: 'scheduledAt'),
        title: any(named: 'title'),
        body: any(named: 'body'),
        request: any(named: 'request'),
      ),
    ).thenAnswer((call) async {
      final id = call.namedArguments[#id] as int;
      pending.add(id);
      await schedule?.call(id);
    });
    when(() => notifications.cancelLocalReminder(any())).thenAnswer((
      call,
    ) async {
      pending.remove(call.positionalArguments.first as int);
    });
    final resolver = ReminderTimezoneResolver(
      repository: _Zones(),
      deviceLoader: () async => 'UTC',
    );
    final service = ReminderService(
      timezoneResolver: resolver,
      calendarRepository: calendar,
      notifications: notifications,
      settingsRepository: settings,
      now: () => DateTime.utc(2026, 9, 30, 12),
    );
    addTearDown(service.dispose);
    addTearDown(resolver.dispose);
    return (
      service: service,
      settings: settings,
      notifications: notifications,
      pending: pending,
    );
  }

  const workspaces = [Workspace(id: 'ws', name: 'Synthetic workspace')];
  const disabled = ReminderSettings(tasksEnabled: false, eventsEnabled: false);

  test('opt-out invalidates enabled entries held at locale lookup', () async {
    final entered = Completer<void>();
    final release = Completer<String?>();
    var calls = 0;
    final f = await fixture(
      locale: () {
        if (calls++ == 0) {
          entered.complete();
          return release.future;
        }
        return Future.value('en');
      },
    );
    final started = f.service.startSession('user', workspaces);
    await entered.future;
    final changed = f.service.updateSettings(disabled);
    release.complete('en');
    await Future.wait([started, changed]);
    verifyNever(
      () => f.notifications.scheduleLocalReminder(
        id: any(named: 'id'),
        scheduledAt: any(named: 'scheduledAt'),
        title: any(named: 'title'),
        body: any(named: 'body'),
        request: any(named: 'request'),
      ),
    );
    expect(f.pending, isEmpty);
    expect(f.service.status.error, isNull);
  });

  test(
    'opt-out reconciles OS-accepted ID and stops subsequent stale alerts',
    () async {
      final entered = Completer<int>();
      final release = Completer<void>();
      var calls = 0;
      final f = await fixture(
        twoEvents: true,
        schedule: (id) async {
          if (calls++ == 0) {
            entered.complete(id);
            await release.future;
          }
        },
      );
      final started = f.service.startSession('user', workspaces);
      final accepted = await entered.future;
      final changed = f.service.updateSettings(disabled);
      release.complete();
      await Future.wait([started, changed]);
      expect(calls, 1);
      expect(f.pending, isEmpty);
      verify(() => f.notifications.cancelLocalReminder(accepted)).called(1);
      final store = await SharedPreferences.getInstance();
      expect(store.getStringList('reminders.user.scheduledIds'), isEmpty);
    },
  );

  test('ordinary enabled refresh schedules the current alert once', () async {
    var calls = 0;
    final f = await fixture(
      schedule: (_) async {
        calls++;
      },
    );
    await f.service.startSession('user', workspaces);
    expect(calls, 1);
    expect(f.pending, hasLength(1));
    expect(f.service.status.scheduledCount, 1);
  });

  test('held settings save cannot refresh replacement A after A-B-A', () async {
    var locales = 0;
    final f = await fixture(
      locale: () async {
        locales++;
        return 'en';
      },
    );
    await f.service.startSession('user', const []);
    final entered = Completer<void>();
    final release = Completer<void>();
    final changed = f.service.updateSettings(_HeldSettings(entered, release));
    await entered.future;
    await f.service.stopSession();
    await f.service.startSession('other', const []);
    await f.service.startSession('user', const []);
    final beforeRelease = locales;
    release.complete();
    await changed;
    expect(locales, beforeRelease);
    expect(f.service.userId, 'user');
  });
}
