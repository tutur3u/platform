import 'dart:async';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/time_tracking/period_stats.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/models/time_tracking/session_page.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Repository extends Mock implements ITimeTrackerRepository {}

class _Storage extends Mock implements FlutterSecureStorage {}

void main() {
  late Directory directory;
  late CacheStore store;
  late _Repository repo;
  late String? actor;
  late TimeTrackerCubit cubit;
  Future<void> Function(String)? checkpoint;
  Completer<void>? directoryGate;

  setUpAll(() => registerFallbackValue(DateTime(2000)));
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    actor = 'alice';
    checkpoint = null;
    directoryGate = null;
    directory = await Directory.systemTemp.createTemp('timer-scope-');
    final storage = _Storage();
    final values = <String, String>{};
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((call) async => values[call.namedArguments[#key] as String]);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      values[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String;
    });
    when(() => storage.delete(key: any(named: 'key'))).thenAnswer((call) async {
      values.remove(call.namedArguments[#key]);
    });
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async {
        await directoryGate?.future;
        return directory;
      },
      persistenceCheckpoint: (stage) => checkpoint?.call(stage),
    );
    repo = _Repository();
    when(() => repo.getRunningSession(any())).thenAnswer((_) async => null);
    when(() => repo.getCategories(any())).thenAnswer((_) async => const []);
    when(
      () => repo.getSessions(any(), limit: any(named: 'limit')),
    ).thenAnswer((_) async => const []);
    when(
      () => repo.getStats(any(), any(), timezone: any(named: 'timezone')),
    ).thenAnswer(
      (call) async => TimeTrackerStats(
        todayTime: call.positionalArguments.first == 'new' ? 22 : 11,
      ),
    );
    when(
      () => repo.getHistorySessions(
        any(),
        dateFrom: any(named: 'dateFrom'),
        dateTo: any(named: 'dateTo'),
        userId: any(named: 'userId'),
      ),
    ).thenAnswer(
      (_) async => const TimeTrackingSessionPage(sessions: [], hasMore: false),
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
      () => repo.loadPomodoroSettings(),
    ).thenAnswer((_) async => const PomodoroSettings());
    when(() => repo.getWorkspaceSettings(any())).thenAnswer((_) async => null);
    cubit = TimeTrackerCubit(
      repository: repo,
      cacheStore: store,
      currentUserId: () => actor,
    );
  });
  tearDown(() async {
    checkpoint = null;
    await cubit.close();
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  test(
    'a delayed cache initialization cannot publish after scope reset',
    () async {
      directoryGate = Completer<void>();
      final old = cubit.loadData('old', 'alice');
      cubit.prepareForWorkspaceSwitch();
      directoryGate!.complete();
      await old;
      expect(cubit.state.status, TimeTrackerStatus.initial);
      verifyNever(() => repo.getRunningSession(any()));
    },
  );

  test('old repository completion cannot overwrite a new workspace', () async {
    await store.init();
    final entered = Completer<void>();
    final pending = Completer<TimeTrackerStats>();
    when(
      () => repo.getStats('old', 'alice', timezone: any(named: 'timezone')),
    ).thenAnswer((_) {
      entered.complete();
      return pending.future;
    });
    final old = cubit.loadData('old', 'alice');
    await entered.future;
    await cubit.loadData('new', 'alice');
    pending.complete(const TimeTrackerStats(todayTime: 999));
    await old;
    expect(cubit.state.stats?.todayTime, 22);
    expect(
      TimeTrackerCubit.seedStateFor(
        wsId: 'new',
        userId: 'alice',
        cacheStore: store,
        actorId: 'alice',
      )?.stats?.todayTime,
      22,
    );
  });

  test(
    'same actor return after logout cannot revive the old lifetime',
    () async {
      await store.init();
      final entered = Completer<void>();
      final pending = Completer<TimeTrackerStats>();
      when(
        () => repo.getStats(any(), any(), timezone: any(named: 'timezone')),
      ).thenAnswer((_) {
        entered.complete();
        return pending.future;
      });
      final old = cubit.loadData('old', 'alice');
      await entered.future;
      actor = null;
      await store.clearScope(userId: 'alice', resourceOnly: true);
      actor = 'alice';
      pending.complete(const TimeTrackerStats(todayTime: 999));
      await old;
      expect(cubit.state.stats, isNull);
      expect(
        TimeTrackerCubit.seedStateFor(
          wsId: 'old',
          userId: 'alice',
          cacheStore: store,
          actorId: 'alice',
        ),
        isNull,
      );
    },
  );

  test(
    'a storage write already awaiting disk cannot survive scope reset',
    () async {
      await store.init();
      final entered = Completer<void>();
      final release = Completer<void>();
      checkpoint = (stage) async {
        if (stage == 'snapshot') {
          entered.complete();
          await release.future;
        }
      };
      final old = cubit.loadData('old', 'alice');
      await entered.future;
      cubit.prepareForWorkspaceSwitch();
      checkpoint = null;
      release.complete();
      await old;
      expect(cubit.state.status, TimeTrackerStatus.initial);
      expect(
        TimeTrackerCubit.seedStateFor(
          wsId: 'old',
          userId: 'alice',
          cacheStore: store,
          actorId: 'alice',
        ),
        isNull,
      );
      await cubit.loadData('new', 'alice');
      expect(cubit.state.stats?.todayTime, 22);
    },
  );

  test(
    'current workspace remains visible during a failed revalidation',
    () async {
      await store.init();
      await cubit.loadData('new', 'alice');
      final entered = Completer<void>();
      final pending = Completer<TimeTrackerStats>();
      when(
        () => repo.getStats(any(), any(), timezone: any(named: 'timezone')),
      ).thenAnswer((_) {
        entered.complete();
        return pending.future;
      });
      final refresh = cubit.loadData('new', 'alice', forceRefresh: true);
      await entered.future;
      expect(cubit.state.stats?.todayTime, 22);
      expect(cubit.state.isRefreshing, isTrue);
      pending.completeError(const SocketException('offline'));
      await refresh;
      expect(cubit.state.stats?.todayTime, 22);
      expect(cubit.state.status, TimeTrackerStatus.loaded);
      expect(cubit.state.isRefreshing, isFalse);
    },
  );
}
