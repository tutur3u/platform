import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/dashboard/view/personal_agenda.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Events extends Mock implements CalendarRepository {}

class _Zones extends Mock implements TimezoneSettingsRepository {
  // Keep existing caller fixtures while the real repository owns coalescing.
  @override
  Future<String> readPersonal(
    String userId, {
    Duration timeout = const Duration(seconds: 15),
  }) => loadPersonal();
  @override
  Future<String> readWorkspace(
    String userId,
    String id, {
    Duration timeout = const Duration(seconds: 15),
  }) => loadWorkspace(id);
}

void main() {
  setUpAll(() => registerFallbackValue(DateTime.utc(2026)));

  testWidgets(
    'authenticated Agenda keeps personal scope and reloads its timezone',
    (tester) async {
      CalendarCubit.clearCache();
      await tester.runAsync(() async {
        await CacheStore.instance.init();
        await CacheStore.instance.clearScope();
      });
      final auth = _Auth();
      final workspaces = _Workspaces();
      when(() => workspaces.hasAuthenticatedActor).thenReturn(true);
      final events = _Events();
      final zones = _Zones();
      const user = User(
        id: 'synthetic-actor',
        appMetadata: {},
        userMetadata: {},
        aud: 'authenticated',
        createdAt: '2026-01-01T00:00:00Z',
      );
      whenListen(
        auth,
        const Stream<AuthState>.empty(),
        initialState: const AuthState.authenticated(user),
      );
      whenListen(
        workspaces,
        const Stream<WorkspaceState>.empty(),
        initialState: const WorkspaceState(
          currentWorkspace: Workspace(id: 'shared'),
          workspaces: [
            Workspace(id: 'shared'),
            Workspace(id: 'personal', personal: true),
          ],
        ),
      );
      var personalZone = 'auto';
      var workspaceZone = 'America/Los_Angeles';
      when(zones.loadPersonal).thenAnswer((_) async => personalZone);
      when(
        () => zones.loadWorkspace('shared'),
      ).thenAnswer((_) async => 'Asia/Tokyo');
      when(
        () => zones.loadWorkspace('personal'),
      ).thenAnswer((_) async => workspaceZone);
      final settings = TimezoneSettingsCubit(
        repository: zones,
        deviceLoader: () async => 'Europe/London',
      );
      await settings.load(userId: user.id, workspaceId: 'shared');
      expect(settings.state.effective, 'Asia/Tokyo');
      final now = DateTime.now().toUtc();
      final midnight = DateTime.utc(now.year, now.month, now.day, 0, 30);
      Completer<List<CalendarEvent>>? blockedRead;
      final fixtureEvents = [
        CalendarEvent(
          id: 'synthetic-event',
          title: 'Synthetic personal calendar row',
          startAt: midnight,
          endAt: midnight.add(const Duration(hours: 1)),
        ),
      ];
      when(
        () => events.getEvents(
          'personal',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).thenAnswer((_) async {
        final pending = blockedRead;
        blockedRead = null;
        return pending == null ? fixtureEvents : await pending.future;
      });
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: auth),
            BlocProvider<WorkspaceCubit>.value(value: workspaces),
            BlocProvider<TimezoneSettingsCubit>.value(value: settings),
          ],
          child: PersonalAgenda(repository: events, cacheUserId: () => user.id),
        ),
      );
      Future<void> settle() async {
        for (var i = 0; i < 10; i++) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 100)),
          );
          await tester.pump(const Duration(milliseconds: 50));
        }
      }

      await settle();
      final calendar = tester
          .element(find.byType(PersonalAgendaView))
          .read<CalendarCubit>();
      expect(calendar.state.timezone, 'America/Los_Angeles');
      expect(calendar.state.error, isNull);
      expect(calendar.state.status, CalendarStatus.loaded);
      expect(calendar.state.events, hasLength(1));
      expect(
        calendar.state.displayEvents.single.startAt!.day,
        midnight.subtract(const Duration(days: 1)).day,
      );
      verify(
        () => events.getEvents(
          'personal',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).called(1);
      verify(() => zones.loadWorkspace('shared')).called(1);
      expect(workspaces.state.currentWorkspace!.id, 'shared');

      // Loaded UI precedes the durable cache commit. Agenda deliberately waits
      // for that commit before changing its wall-clock query; wait on the store
      // write barrier instead of assuming a fixed delay includes disk flushes.
      var writesComplete = false;
      unawaited(
        CacheStore.instance
            .queryReplica(
              namespace: 'calendar.events.utc.v2',
              userId: user.id,
              workspaceId: 'personal',
            )
            .then((_) => writesComplete = true),
      );
      // Disk callbacks must run in the real zone while cache continuations
      // still receive fake-zone pumps. Awaiting the whole barrier in runAsync
      // deadlocks those continuations instead of advancing them.
      for (var i = 0; i < 100 && !writesComplete; i++) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 10)),
        );
        await tester.pump();
      }
      expect(writesComplete, isTrue);

      final inFlight = Completer<List<CalendarEvent>>();
      blockedRead = inFlight;
      personalZone = 'Asia/Ho_Chi_Minh';
      await settings.reload();
      await settle();
      expect(calendar.state.timezone, personalZone);
      expect(calendar.state.displayEvents.single.startAt!.hour, 7);
      verify(
        () => events.getEvents(
          'personal',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).called(1);

      personalZone = 'auto';
      workspaceZone = 'auto';
      await settings.reload();
      await settle();
      // A later setting must not change the wall-clock query while the earlier
      // refresh is still in flight, or overlap its persisted cache write.
      expect(calendar.state.timezone, 'Asia/Ho_Chi_Minh');
      verifyNever(
        () => events.getEvents(
          'personal',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      );
      inFlight.complete(fixtureEvents);
      await settle();
      expect(calendar.state.timezone, 'Europe/London');
      verify(
        () => events.getEvents(
          'personal',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).called(1);
      verifyNever(
        () => events.getEvents(
          'shared',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      );
      expect(workspaces.state.currentWorkspace!.id, 'shared');
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await settings.close();
      await auth.close();
      await workspaces.close();
    },
  );
}
