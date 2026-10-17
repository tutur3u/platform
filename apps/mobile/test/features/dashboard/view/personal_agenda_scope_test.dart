import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/dashboard/view/personal_agenda.dart';
import 'package:mobile/features/dashboard/view/personal_agenda_scope.dart';
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

class _Write {
  _Write(this.key);
  final CacheKey key;
  final gate = Completer<void>();
  void acknowledge() => gate.complete();
  void reject() => gate.completeError(StateError('Owned fixture rejection'));
}

// Controlled storage API acknowledgments only; no disk/durable commit proof.
class _Storage extends Mock implements CacheStore {
  final writes = <_Write>[];
  int acknowledged = 0;
  Completer<void>? waiting;
  Future<void> waitForNextWrite() {
    if (writes.length > acknowledged) return Future<void>.value();
    return (waiting ??= Completer<void>()).future;
  }

  void acknowledgeNext() => writes[acknowledged++].acknowledge();
  void rejectPending() {
    for (final write in writes) {
      if (!write.gate.isCompleted) write.reject();
    }
  }

  @override
  Future<CacheReadResult<T>> read<T>({
    required CacheKey key,
    required CacheJsonDecoder<T> decode,
  }) async => CacheReadResult<T>(state: CacheEntryState.missing);
  @override
  Future<void> write({
    required CacheKey key,
    required CachePolicy policy,
    required Object? payload,
    String? etag,
    List<String> tags = const [],
    int? expectedRevision,
    void Function()? checkScope,
    bool requirePublication = false,
  }) async {
    checkScope?.call();
    final write = _Write(key);
    writes.add(write);
    waiting?.complete();
    waiting = null;
    await write.gate.future;
    checkScope?.call();
  }
}

// Advance owned callbacks and fake-zone continuations until the actual
// operation finishes. The bound is a deadlock guard, not a settling delay.
Future<void> _pumpCompletion(
  WidgetTester tester,
  Future<void> operation,
) async {
  var complete = false;
  Object? failure;
  StackTrace? failureStack;
  unawaited(
    operation.then<void>(
      (_) {
        complete = true;
      },
      onError: (Object error, StackTrace stack) {
        failure = error;
        failureStack = stack;
        complete = true;
      },
    ),
  );
  final elapsed = Stopwatch()..start();
  while (!complete && elapsed.elapsed < const Duration(seconds: 5)) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
    await tester.pump();
  }
  expect(
    complete,
    isTrue,
    reason: 'The observed cache/query operation must finish',
  );
  if (failure != null) Error.throwWithStackTrace(failure!, failureStack!);
}

void main() {
  setUpAll(() => registerFallbackValue(DateTime.utc(2026)));

  testWidgets('authenticated Agenda keeps personal scope '
      'and reloads its timezone', (tester) async {
    CalendarCubit.clearCache();
    final storage = _Storage();
    final handle = PersonalAgendaRefreshHandle();
    final receipts = <Future<void>>[];
    final auth = _Auth();
    final workspaces = _Workspaces();
    when(() => workspaces.hasAuthenticatedActor).thenReturn(true);
    final events = _Events();
    final zones = _Zones();
    const user = User(
      id: '33333333-3333-4333-8333-333333333333',
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
        currentWorkspace: Workspace(id: '66666666-6666-4666-8666-666666666666'),
        workspaces: [
          Workspace(id: '66666666-6666-4666-8666-666666666666'),
          Workspace(id: '77777777-7777-4777-8777-777777777777', personal: true),
        ],
      ),
    );
    var personalZone = 'auto';
    var workspaceZone = 'America/Los_Angeles';
    when(zones.loadPersonal).thenAnswer((_) async => personalZone);
    when(
      () => zones.loadWorkspace('66666666-6666-4666-8666-666666666666'),
    ).thenAnswer((_) async => 'Asia/Tokyo');
    when(
      () => zones.loadWorkspace('77777777-7777-4777-8777-777777777777'),
    ).thenAnswer((_) async => workspaceZone);
    final settings = TimezoneSettingsCubit(
      repository: zones,
      deviceLoader: () async => 'Europe/London',
    );
    await settings.load(
      userId: user.id,
      workspaceId: '66666666-6666-4666-8666-666666666666',
    );
    expect(settings.state.effective, 'Asia/Tokyo');
    final now = DateTime.now().toUtc();
    final midnight = DateTime.utc(now.year, now.month, now.day, 0, 30);
    Completer<List<CalendarEvent>>? blockedRead;
    Completer<List<CalendarEvent>>? heldRead;
    final finalQuery = Completer<void>();
    var observeFinalQuery = false;
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
        '77777777-7777-4777-8777-777777777777',
        start: any(named: 'start'),
        end: any(named: 'end'),
      ),
    ).thenAnswer((_) async {
      final pending = blockedRead;
      blockedRead = null;
      if (observeFinalQuery && !finalQuery.isCompleted) finalQuery.complete();
      return pending == null ? fixtureEvents : await pending.future;
    });
    try {
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: auth),
            BlocProvider<WorkspaceCubit>.value(value: workspaces),
            BlocProvider<TimezoneSettingsCubit>.value(value: settings),
          ],
          child: PersonalAgenda(
            repository: events,
            cacheUserId: () => user.id,
            cacheStore: storage,
            refreshHandle: handle,
          ),
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
          '77777777-7777-4777-8777-777777777777',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).called(1);
      verify(
        () => zones.loadWorkspace('66666666-6666-4666-8666-666666666666'),
      ).called(1);
      expect(
        workspaces.state.currentWorkspace!.id,
        '66666666-6666-4666-8666-666666666666',
      );

      // Acknowledge the observed owned write and await the exact Scope receipt.
      final initial = handle.latest!.completion;
      receipts.add(initial);
      storage.acknowledgeNext();
      await _pumpCompletion(tester, initial);

      final inFlight = Completer<List<CalendarEvent>>();
      heldRead = inFlight;
      blockedRead = inFlight;
      personalZone = 'Asia/Ho_Chi_Minh';
      await settings.reload();
      await settle();
      expect(calendar.state.timezone, personalZone);
      expect(calendar.state.displayEvents.single.startAt!.hour, 7);
      verify(
        () => events.getEvents(
          '77777777-7777-4777-8777-777777777777',
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
          '77777777-7777-4777-8777-777777777777',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      );
      observeFinalQuery = true;
      inFlight.complete(fixtureEvents);
      // The loaded state precedes the owned fixture acknowledgment.
      // Await the actual refresh lifecycle rather than a disk query proxy.
      // The predecessor's owned write is admitted after its held query returns.
      final latest = handle.latest!.completion;
      receipts.add(latest);
      await _pumpCompletion(tester, storage.waitForNextWrite());
      storage.acknowledgeNext();
      await _pumpCompletion(tester, finalQuery.future);
      await _pumpCompletion(tester, storage.waitForNextWrite());
      storage.acknowledgeNext();
      await _pumpCompletion(tester, latest);
      expect(calendar.state.timezone, 'Europe/London');
      verify(
        () => events.getEvents(
          '77777777-7777-4777-8777-777777777777',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).called(1);
      verifyNever(
        () => events.getEvents(
          '66666666-6666-4666-8666-666666666666',
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      );
      expect(
        workspaces.state.currentWorkspace!.id,
        '66666666-6666-4666-8666-666666666666',
      );
      expect(tester.takeException(), isNull);
    } finally {
      final last = handle.latest?.completion;
      if (last != null && !receipts.contains(last)) {
        receipts.add(last);
      }
      final drain = Future.wait(
        receipts.map(
          (receipt) => receipt.then<void>((_) {}, onError: (Object error) {}),
        ),
      ).then<void>((_) {});
      await tester.pumpWidget(const SizedBox.shrink());
      final pending = heldRead;
      if (pending != null && !pending.isCompleted) {
        pending.complete(fixtureEvents);
      }
      storage.rejectPending();
      await _pumpCompletion(tester, drain);
      await settings.close();
      await auth.close();
      await workspaces.close();
    }
  });
}
