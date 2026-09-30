import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/data/repositories/workspace_repository.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/reminders/reminder_service.dart';
import 'package:mobile/features/reminders/reminder_timezone_resolver.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Calendar extends Mock implements CalendarRepository {}

class _Preferences extends Mock implements TimezoneSettingsRepository {}

class _Settings extends Mock implements SettingsRepository {}

class _Notifications extends Mock implements PushNotificationService {}

class _Workspaces extends Mock implements WorkspaceRepository {}

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
    'zone change during initialization retains disabled reminder settings',
    () async {
      SharedPreferences.setMockInitialValues({
        'reminders.user.tasksEnabled': false,
        'reminders.user.eventsEnabled': false,
      });
      final notifications = _Notifications();
      final pending = Completer<Set<int>>();
      final entered = Completer<void>();
      when(notifications.pendingLocalReminderIds).thenAnswer((_) {
        entered.complete();
        return pending.future;
      });
      when(
        () => notifications.notificationsEnabled,
      ).thenAnswer((_) async => true);
      final service = ReminderService(notifications: notifications);
      addTearDown(service.dispose);
      final started = service.startSession('user', const []);
      await entered.future;
      final changed = service.timezoneChanged(userId: 'user');
      pending.complete(<int>{});
      await Future.wait([started, changed]);
      expect(service.settings.tasksEnabled, isFalse);
      expect(service.settings.eventsEnabled, isFalse);
      verifyNever(() => notifications.cancelLocalReminder(any()));
    },
  );

  test(
    'cold workspace fetch failure preserves persisted native alerts',
    () async {
      SharedPreferences.setMockInitialValues({
        'reminders.user.tasksEnabled': false,
        'reminders.user.eventsEnabled': false,
        'reminders.user.scheduledIds': ['4242'],
      });
      final repository = _Workspaces();
      when(repository.readCachedWorkspaces).thenAnswer(
        (_) async => const CacheReadResult<List<Workspace>>(
          state: CacheEntryState.missing,
        ),
      );
      when(
        repository.getWorkspaces,
      ).thenThrow(Exception('Synthetic unavailable'));
      final workspace = WorkspaceCubit(workspaceRepository: repository);
      addTearDown(workspace.close);
      final notifications = _Notifications();
      final settings = _Settings();
      final pending = <int>{4242};
      when(
        notifications.pendingLocalReminderIds,
      ).thenAnswer((_) async => pending);
      when(
        () => notifications.notificationsEnabled,
      ).thenAnswer((_) async => true);
      when(settings.getLocale).thenAnswer((_) async => 'en');
      when(() => notifications.cancelLocalReminder(any())).thenAnswer((
        call,
      ) async {
        pending.remove(call.positionalArguments.first as int);
      });
      final service = ReminderService(
        notifications: notifications,
        settingsRepository: settings,
      );
      addTearDown(service.dispose);
      await workspace.loadWorkspaces();
      expect(workspace.state.status, WorkspaceStatus.error);
      await service.startWorkspaceSession('user', workspace.state);
      await service.refreshIfStale();
      expect(pending, {4242});
      final store = await SharedPreferences.getInstance();
      expect(store.getStringList('reminders.user.scheduledIds'), ['4242']);
      verifyNever(() => notifications.cancelLocalReminder(any()));
    },
  );

  for (final verified in [false, true]) {
    test(
      'empty cache needs successful discovery before cancel: $verified',
      () async {
        SharedPreferences.setMockInitialValues({
          'reminders.user.tasksEnabled': false,
          'reminders.user.eventsEnabled': false,
          'reminders.user.scheduledIds': ['4242'],
        });
        final repository = _Workspaces();
        when(repository.readCachedWorkspaces).thenAnswer(
          (_) async => const CacheReadResult<List<Workspace>>(
            state: CacheEntryState.stale,
            data: [],
            hasValue: true,
            isFromCache: true,
          ),
        );
        when(repository.loadDefaultWorkspaceId).thenAnswer((_) async => null);
        when(repository.loadSelectedWorkspace).thenAnswer((_) async => null);
        when(repository.getDefaultWorkspace).thenAnswer((_) async => null);
        when(
          repository.getWorkspaceLimits,
        ).thenThrow(Exception('Synthetic unavailable'));
        if (verified) {
          when(repository.getWorkspaces).thenAnswer((_) async => []);
        } else {
          when(
            repository.getWorkspaces,
          ).thenThrow(Exception('Synthetic unavailable'));
        }
        final workspace = WorkspaceCubit(workspaceRepository: repository);
        addTearDown(workspace.close);
        final notifications = _Notifications();
        final settings = _Settings();
        final pending = <int>{4242};
        when(
          notifications.pendingLocalReminderIds,
        ).thenAnswer((_) async => pending);
        when(
          () => notifications.notificationsEnabled,
        ).thenAnswer((_) async => true);
        when(settings.getLocale).thenAnswer((_) async => 'en');
        when(() => notifications.cancelLocalReminder(any())).thenAnswer((
          call,
        ) async {
          pending.remove(call.positionalArguments.first as int);
        });
        final service = ReminderService(
          notifications: notifications,
          settingsRepository: settings,
        );
        addTearDown(service.dispose);
        await workspace.loadWorkspaces();
        expect(workspace.state.status, WorkspaceStatus.loaded);
        expect(workspace.state.emptyMembershipConfirmed, verified);
        await service.startWorkspaceSession('user', workspace.state);
        await service.refreshIfStale();
        expect(pending, verified ? isEmpty : equals({4242}));
        if (!verified) {
          verifyNever(() => notifications.cancelLocalReminder(any()));
        }
        // Even unresolved discovery binds the ledger to the account for logout.
        await service.stopSession();
        expect(pending, isEmpty);
        final store = await SharedPreferences.getInstance();
        expect(store.getStringList('reminders.user.scheduledIds'), isNull);
      },
    );
  }

  for (final transition in ['zone change', 'logout', 'workspace removal']) {
    test(
      '$transition reconciles an OS-accepted pending notification',
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
        var zone = 'America/New_York';
        when(preferences.loadPersonal).thenAnswer((_) async => zone);
        when(
          () => preferences.loadWorkspace(any()),
        ).thenAnswer((_) async => 'auto');
        when(settings.getLocale).thenAnswer((_) async => 'en');
        when(
          notifications.pendingLocalReminderIds,
        ).thenAnswer((_) async => <int>{});
        when(
          () => notifications.notificationsEnabled,
        ).thenAnswer((_) async => true);
        const event = CalendarEvent(
          id: 'synthetic-all-day',
          title: 'Synthetic exam',
        );
        final allDay = event.copyWith(
          startAt: DateTime.utc(2026, 10),
          endAt: DateTime.utc(2026, 10, 2),
        );
        when(
          () => calendar.getEvents(
            any(),
            start: any(named: 'start'),
            end: any(named: 'end'),
          ),
        ).thenAnswer((_) async => [allDay]);
        final scheduled = <int>{};
        final canceled = <int>[];
        final entered = Completer<int>();
        final finishNativeSchedule = Completer<void>();
        when(
          () => notifications.scheduleLocalReminder(
            id: any(named: 'id'),
            scheduledAt: any(named: 'scheduledAt'),
            title: any(named: 'title'),
            body: any(named: 'body'),
            request: any(named: 'request'),
          ),
        ).thenAnswer((invocation) async {
          final id = invocation.namedArguments[#id] as int;
          scheduled.add(
            id,
          ); // The OS accepted the alert before the await finishes.
          entered.complete(id);
          await finishNativeSchedule.future;
        });
        when(() => notifications.cancelLocalReminder(any())).thenAnswer((
          invocation,
        ) async {
          final id = invocation.positionalArguments.first as int;
          canceled.add(id);
          scheduled.remove(id);
        });
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
          now: () => DateTime.utc(2026, 9, 30, 12),
        );
        addTearDown(service.dispose);
        final started = service.startSession('user', const [
          Workspace(id: 'ws', name: 'Synthetic workspace'),
        ]);
        final id = await entered.future;
        expect(scheduled, {id});
        // NY's tomorrow 09:00 minus 1d is 13Z (future). HCM becomes 02Z (past).
        zone = 'Asia/Ho_Chi_Minh';
        final changed = switch (transition) {
          'logout' => service.stopSession(),
          'workspace removal' => service.startSession('user', const []),
          _ => service.timezoneChanged(userId: 'user', workspaceId: 'ws'),
        };
        finishNativeSchedule.complete();
        await Future.wait([started, changed]);
        expect(service.status.error, isNull);
        expect(scheduled, isEmpty);
        expect(canceled, [id]);
        final store = await SharedPreferences.getInstance();
        expect(
          store.getStringList('reminders.user.scheduledIds'),
          transition == 'logout' ? isNull : isEmpty,
        );
        if (transition == 'logout') expect(service.userId, isNull);
      },
    );
  }
}
