import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/data/models/time_tracking/period_stats.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/models/time_tracking/session_page.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/view/time_tracker_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/pump_app.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Calendar extends MockCubit<CalendarSettingsState>
    implements CalendarSettingsCubit {}

class _Repository extends Mock implements ITimeTrackerRepository {}

// Host lifetime is independent of disk I/O; real Hive scope interleavings live
// in time_tracker_scope_test.dart.
class _Cache extends Mock implements CacheStore {
  @override
  int resourceRevisionFor(CacheKey key) => 0;

  @override
  CacheReadResult<T> peek<T>({
    required CacheKey key,
    required CacheJsonDecoder<T> decode,
  }) => CacheReadResult<T>(state: CacheEntryState.missing);

  @override
  Future<CacheReadResult<T>> read<T>({
    required CacheKey key,
    required CacheJsonDecoder<T> decode,
  }) async => peek<T>(key: key, decode: decode);

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
  }
}

AuthState signedIn() => const AuthState.authenticated(
  User(
    id: 'alice',
    appMetadata: {},
    userMetadata: {},
    aud: 'authenticated',
    createdAt: '2026-10-06T00:00:00Z',
  ),
);

void main() {
  setUpAll(() => registerFallbackValue(DateTime(2000)));
  testWidgets(
    'batched same-account login replaces Timer while old preference read waits',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      await tester.runAsync(SharedPreferences.getInstance);
      final store = _Cache();
      final auth = _Auth();
      final authEvents = StreamController<AuthState>();
      addTearDown(authEvents.close);
      whenListen(auth, authEvents.stream, initialState: signedIn());
      final workspace = _Workspace();
      when(() => workspace.state).thenReturn(
        const WorkspaceState(
          currentWorkspace: Workspace(id: 'workspace', name: 'Synthetic'),
        ),
      );
      when(() => workspace.stream).thenAnswer((_) => const Stream.empty());
      final calendar = _Calendar();
      when(() => calendar.state).thenReturn(const CalendarSettingsState());
      when(() => calendar.stream).thenAnswer((_) => const Stream.empty());
      final oldPreference = Completer<void>();
      var preferenceCalls = 0;
      when(() => calendar.loadWorkspacePreference(any())).thenAnswer((_) {
        if (++preferenceCalls == 1) return oldPreference.future;
        return Future.value();
      });
      final repo = _Repository();
      when(() => repo.getRunningSession(any())).thenAnswer((_) async => null);
      when(() => repo.getCategories(any())).thenAnswer((_) async => const []);
      when(
        () => repo.getSessions(any(), limit: any(named: 'limit')),
      ).thenAnswer((_) async => const []);
      when(
        () => repo.getStats(any(), any(), timezone: any(named: 'timezone')),
      ).thenAnswer((call) async => const TimeTrackerStats(todayTime: 22));
      when(
        () => repo.getHistorySessions(
          any(),
          dateFrom: any(named: 'dateFrom'),
          dateTo: any(named: 'dateTo'),
          userId: any(named: 'userId'),
        ),
      ).thenAnswer(
        (_) async =>
            const TimeTrackingSessionPage(sessions: [], hasMore: false),
      );
      when(
        () => repo.getPeriodStats(
          any(),
          dateFrom: any(named: 'dateFrom'),
          dateTo: any(named: 'dateTo'),
          userId: any(named: 'userId'),
          timezone: any(named: 'timezone'),
        ),
      ).thenAnswer((_) async => const TimeTrackingPeriodStats());
      when(
        repo.loadPomodoroSettings,
      ).thenAnswer((_) async => const PomodoroSettings());
      when(
        () => repo.getWorkspaceSettings(any()),
      ).thenAnswer((_) async => null);
      final created = <TimeTrackerCubit>[];
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: auth),
            BlocProvider<WorkspaceCubit>.value(value: workspace),
            BlocProvider<CalendarSettingsCubit>.value(value: calendar),
          ],
          child: TimeTrackerPage(
            cubitFactory: (_) {
              final cubit = TimeTrackerCubit(
                repository: repo,
                cacheStore: store,
                currentUserId: () => auth.state.user?.id,
              );
              created.add(cubit);
              return cubit;
            },
          ),
        ),
      );
      await tester.pump();
      expect(preferenceCalls, 1);
      final old = created.single;
      authEvents
        ..add(const AuthState.unauthenticated())
        ..add(signedIn());
      await tester.pump();
      await tester.pump();
      final current = created.last;
      var loaded = current.state.status == TimeTrackerStatus.loaded;
      final subscription = current.stream.listen((state) {
        if (state.status == TimeTrackerStatus.loaded) loaded = true;
      });
      addTearDown(subscription.cancel);
      for (var frame = 0; !loaded && frame < 300; frame++) {
        await tester.pump(const Duration(milliseconds: 16));
        await tester.runAsync(() => Future<void>.delayed(Duration.zero));
      }
      expect(loaded, isTrue, reason: 'New Timer host must complete its load');
      await tester.pump();
      expect(created.length, 2);
      expect(old.isClosed, isTrue);
      expect(created.last.state.status, TimeTrackerStatus.loaded);
      expect(created.last.state.stats?.todayTime, 22);
      oldPreference.complete();
      await tester.pump();
      expect(created.last.state.stats?.todayTime, 22);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
