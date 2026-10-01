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
import 'package:mobile/features/reminders/reminder_timezone_resolver.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Calendar extends Mock implements CalendarRepository {}

class _Preferences extends Mock implements TimezoneSettingsRepository {}

class _Settings extends Mock implements SettingsRepository {}

class _Notifications extends Mock implements PushNotificationService {}

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
  test(
    'timezone replan updates queued all-day copy and keeps unrelated IDs',
    () async {
      SharedPreferences.setMockInitialValues({
        'reminders.user.tasksEnabled': false,
        'reminders.user.eventOffsets': ['1d'],
      });
      CalendarCubit.clearCache();
      await CacheStore.instance.clearScope();
      final calendar = _Calendar();
      final preferences = _Preferences();
      final settings = _Settings();
      final notifications = _Notifications();
      var personal = 'auto';
      when(preferences.loadPersonal).thenAnswer((_) async => personal);
      when(() => preferences.loadWorkspace(any())).thenAnswer(
        (invocation) async => invocation.positionalArguments.first == 'changed'
            ? 'America/New_York'
            : 'Asia/Ho_Chi_Minh',
      );
      when(settings.getLocale).thenAnswer((_) async => 'en');
      when(
        notifications.pendingLocalReminderIds,
      ).thenAnswer((_) async => <int>{});
      when(
        () => notifications.notificationsEnabled,
      ).thenAnswer((_) async => true);
      final queue = <int, (DateTime, String)>{};
      final canceled = <int>[];
      when(
        () => notifications.scheduleLocalReminder(
          id: any(named: 'id'),
          scheduledAt: any(named: 'scheduledAt'),
          title: any(named: 'title'),
          body: any(named: 'body'),
          request: any(named: 'request'),
        ),
      ).thenAnswer((invocation) async {
        queue[invocation.namedArguments[#id] as int] = (
          invocation.namedArguments[#scheduledAt] as DateTime,
          invocation.namedArguments[#body] as String,
        );
      });
      when(() => notifications.cancelLocalReminder(any())).thenAnswer((
        invocation,
      ) async {
        final id = invocation.positionalArguments.first as int;
        canceled.add(id);
        queue.remove(id);
      });
      final now = DateTime.now().toUtc();
      final day = DateTime.utc(now.year, now.month, now.day + 5);
      final event = CalendarEvent(
        id: 'all-day',
        title: 'Synthetic exam',
        startAt: day,
        endAt: day.add(const Duration(days: 1)),
      );
      Completer<List<CalendarEvent>>? pending;
      when(
        () => calendar.getEvents(
          any(),
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).thenAnswer((_) => pending?.future ?? Future.value([event]));
      final resolver = ReminderTimezoneResolver(
        repository: preferences,
        deviceLoader: () async => 'UTC',
      );
      addTearDown(resolver.dispose);
      final service = ReminderService(
        timezoneResolver: resolver,
        calendarRepository: calendar,
        notifications: notifications,
        settingsRepository: settings,
      );
      addTearDown(service.dispose);
      await service.startSession('user', const [
        Workspace(id: 'changed', name: 'Synthetic changed'),
        Workspace(id: 'unchanged', name: 'Synthetic unchanged'),
      ]);
      expect(service.status.error, isNull);
      expect(queue, hasLength(2));
      var before = Map<int, (DateTime, String)>.from(queue);
      // This recent successful plan would normally hit the 15-minute guard.
      personal = 'Asia/Ho_Chi_Minh';
      await service.refreshIfStale();
      expect(queue, before);
      await service.timezoneChanged(userId: 'user', workspaceId: 'changed');
      expect(queue.keys.toSet(), before.keys.toSet());
      expect(
        queue.entries.where((entry) => before[entry.key] != entry.value),
        hasLength(1),
      );
      expect(canceled, isEmpty);
      // Also reconcile changes that race an already-running refresh.
      before = Map<int, (DateTime, String)>.from(queue);
      personal = 'auto';
      pending = Completer<List<CalendarEvent>>();
      final stale = service.refresh();
      await Future<void>.delayed(Duration.zero);
      final changed = service.timezoneChanged(
        userId: 'user',
        workspaceId: 'changed',
      );
      final duplicate = service.timezoneChanged(
        userId: 'user',
        workspaceId: 'changed',
      );
      final response = pending;
      pending = null;
      response.complete([event]);
      await Future.wait([stale, changed, duplicate]);
      expect(service.status.error, isNull);
      expect(queue.keys.toSet(), before.keys.toSet());
      expect(canceled, isEmpty);
      expect(
        queue.entries.where((entry) => before[entry.key] != entry.value),
        hasLength(1),
      );
      expect(service.status.isRefreshing, isFalse);
      // An old-account request must never modify the active queue.
      final after = Map<int, (DateTime, String)>.from(queue);
      await service.timezoneChanged(userId: 'other-account');
      expect(queue, after);
    },
  );
}
