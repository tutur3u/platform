import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/time_tracking/goal.dart';
import 'package:mobile/data/models/time_tracking/period_stats.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/models/time_tracking/session_page.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _MockTimeTrackerRepository extends Mock
    implements ITimeTrackerRepository {}

class _TestTimeTrackerCubit extends TimeTrackerCubit {
  _TestTimeTrackerCubit({required super.repository});

  void setThresholdDays(int? thresholdDays) {
    emit(state.copyWith(thresholdDays: thresholdDays));
  }
}

void main() {
  setUpAll(() {
    registerFallbackValue(DateTime(2000));
  });

  setUpAll(() async {
    await CacheStore.instance.init();
  });

  setUp(() async {
    await CacheStore.instance.clearScope();
    SharedPreferences.setMockInitialValues({});
  });

  group('TimeTrackerCubit.sessionExceedsThreshold', () {
    late _MockTimeTrackerRepository repository;
    late _TestTimeTrackerCubit cubit;

    setUp(() {
      repository = _MockTimeTrackerRepository();
      cubit = _TestTimeTrackerCubit(repository: repository);
    });

    tearDown(() async {
      await cubit.close();
    });

    test('returns false when threshold is null', () {
      cubit.setThresholdDays(null);
      final session = TimeTrackingSession(
        id: 'session-1',
        startTime: DateTime.now().subtract(const Duration(days: 10)),
      );

      expect(cubit.sessionExceedsThreshold(session), isFalse);
    });

    test('returns true when threshold is zero', () {
      cubit.setThresholdDays(0);
      final session = TimeTrackingSession(
        id: 'session-2',
        startTime: DateTime.now().subtract(const Duration(minutes: 5)),
      );

      expect(cubit.sessionExceedsThreshold(session), isTrue);
    });

    test('returns true when session is older than threshold', () {
      cubit.setThresholdDays(2);
      final session = TimeTrackingSession(
        id: 'session-3',
        startTime: DateTime.now().subtract(const Duration(days: 3)),
      );

      expect(cubit.sessionExceedsThreshold(session), isTrue);
    });

    test('returns false when session is within threshold', () {
      cubit.setThresholdDays(3);
      final session = TimeTrackingSession(
        id: 'session-4',
        startTime: DateTime.now().subtract(const Duration(days: 1)),
      );

      expect(cubit.sessionExceedsThreshold(session), isFalse);
    });
  });

  group('TimeTrackerCubit history behavior', () {
    late _MockTimeTrackerRepository repository;
    late TimeTrackerCubit cubit;

    setUp(() {
      repository = _MockTimeTrackerRepository();
      cubit = TimeTrackerCubit(repository: repository);
    });

    tearDown(() async {
      await cubit.close();
    });

    test('changes view mode and loads initial history', () async {
      when(
        () => repository.getHistorySessions(
          any(),
          dateFrom: any(named: 'dateFrom'),
          dateTo: any(named: 'dateTo'),
          cursor: any(named: 'cursor'),
          limit: any(named: 'limit'),
          userId: any(named: 'userId'),
        ),
      ).thenAnswer(
        (_) async => const TimeTrackingSessionPage(
          sessions: [],
          hasMore: false,
        ),
      );
      when(
        () => repository.getPeriodStats(
          any(),
          dateFrom: any(named: 'dateFrom'),
          dateTo: any(named: 'dateTo'),
          userId: any(named: 'userId'),
          timezone: any(named: 'timezone'),
        ),
      ).thenAnswer(
        (_) async => const TimeTrackingPeriodStats(
          totalDuration: 1200,
          sessionCount: 2,
        ),
      );

      expect(cubit.state.historyViewMode, isNot(HistoryViewMode.month));
      await cubit.setHistoryViewMode('ws-1', 'user-1', HistoryViewMode.month);

      expect(cubit.state.historyViewMode, HistoryViewMode.month);
      expect(cubit.state.historyPeriodStats?.sessionCount, 2);
      verify(
        () => repository.getHistorySessions(
          'ws-1',
          dateFrom: any(named: 'dateFrom'),
          dateTo: any(named: 'dateTo'),
          cursor: any(named: 'cursor'),
          limit: any(named: 'limit'),
          userId: 'user-1',
        ),
      ).called(1);
    });

    test('loadHistoryMore appends next page results', () async {
      when(
        () => repository.getHistorySessions(
          any(),
          dateFrom: any(named: 'dateFrom'),
          dateTo: any(named: 'dateTo'),
          cursor: any(named: 'cursor'),
          limit: any(named: 'limit'),
          userId: any(named: 'userId'),
        ),
      ).thenAnswer((invocation) async {
        final cursor = invocation.namedArguments[#cursor] as String?;
        if (cursor == null) {
          return const TimeTrackingSessionPage(
            sessions: [TimeTrackingSession(id: 's1')],
            hasMore: true,
            nextCursor: 'next-1',
          );
        }
        return const TimeTrackingSessionPage(
          sessions: [TimeTrackingSession(id: 's2')],
          hasMore: false,
        );
      });
      when(
        () => repository.getPeriodStats(
          any(),
          dateFrom: any(named: 'dateFrom'),
          dateTo: any(named: 'dateTo'),
          userId: any(named: 'userId'),
          timezone: any(named: 'timezone'),
        ),
      ).thenAnswer((_) async => const TimeTrackingPeriodStats());

      await cubit.loadHistoryInitial('ws-1', 'user-1');
      await cubit.loadHistoryMore('ws-1', 'user-1');

      expect(cubit.state.historySessions.map((e) => e.id), ['s1', 's2']);
      expect(cubit.state.historyHasMore, isFalse);
    });

    test('toggleHistoryStatsAccordion persists preference', () async {
      expect(cubit.state.isHistoryStatsAccordionOpen, isFalse);
      await cubit.toggleHistoryStatsAccordion();
      expect(cubit.state.isHistoryStatsAccordionOpen, isTrue);

      final prefs = await SharedPreferences.getInstance();
      expect(
        prefs.getBool('time_tracker_history_stats_open'),
        isTrue,
      );
    });

    test(
      'loadData refreshes history when route context changes date',
      () async {
        when(
          () => repository.getRunningSession(any()),
        ).thenAnswer((_) async => null);
        when(
          () => repository.getCategories(any()),
        ).thenAnswer((_) async => const []);
        when(
          () => repository.getSessions(
            any(),
            limit: any(named: 'limit'),
          ),
        ).thenAnswer((_) async => const <TimeTrackingSession>[]);
        when(
          () => repository.getStats(
            any(),
            any(),
            timezone: any(named: 'timezone'),
          ),
        ).thenAnswer((_) async => const TimeTrackerStats());
        when(
          () => repository.getHistorySessions(
            any(),
            dateFrom: any(named: 'dateFrom'),
            dateTo: any(named: 'dateTo'),
            cursor: any(named: 'cursor'),
            limit: any(named: 'limit'),
            userId: any(named: 'userId'),
          ),
        ).thenAnswer(
          (_) async => const TimeTrackingSessionPage(
            sessions: [],
            hasMore: false,
          ),
        );
        when(
          () => repository.getPeriodStats(
            any(),
            dateFrom: any(named: 'dateFrom'),
            dateTo: any(named: 'dateTo'),
            userId: any(named: 'userId'),
            timezone: any(named: 'timezone'),
          ),
        ).thenAnswer((_) async => const TimeTrackingPeriodStats());
        when(
          () => repository.loadPomodoroSettings(),
        ).thenAnswer((_) async => const PomodoroSettings());
        when(
          () => repository.getWorkspaceSettings(any()),
        ).thenAnswer((_) async => null);

        await cubit.loadData('ws-1', 'user-1');
        clearInteractions(repository);

        final targetDate = DateTime(2026, 1, 15, 14, 30);
        cubit.setHistoryContext(
          viewMode: HistoryViewMode.day,
          anchorDate: targetDate,
        );

        await cubit.loadData('ws-1', 'user-1');

        expect(cubit.state.historyViewMode, HistoryViewMode.day);
        expect(cubit.state.historyAnchorDate, DateTime(2026, 1, 15));
        verify(
          () => repository.getHistorySessions(
            'ws-1',
            dateFrom: DateTime(2026, 1, 15),
            dateTo: DateTime(2026, 1, 15, 23, 59, 59, 999, 999),
            cursor: any(named: 'cursor'),
            limit: any(named: 'limit'),
            userId: 'user-1',
          ),
        ).called(1);
      },
    );

    test(
      'loadData clears cached history while a new history context refresh '
      'is in flight',
      () async {
        when(
          () => repository.getRunningSession(any()),
        ).thenAnswer((_) async => null);
        when(
          () => repository.getCategories(any()),
        ).thenAnswer((_) async => const []);
        when(
          () => repository.getSessions(
            any(),
            limit: any(named: 'limit'),
          ),
        ).thenAnswer((_) async => const <TimeTrackingSession>[]);
        when(
          () => repository.getStats(
            any(),
            any(),
            timezone: any(named: 'timezone'),
          ),
        ).thenAnswer((_) async => const TimeTrackerStats());

        final refreshedHistoryPageCompleter =
            Completer<TimeTrackingSessionPage>();
        when(
          () => repository.getHistorySessions(
            any(),
            dateFrom: any(named: 'dateFrom'),
            dateTo: any(named: 'dateTo'),
            cursor: any(named: 'cursor'),
            limit: any(named: 'limit'),
            userId: any(named: 'userId'),
          ),
        ).thenAnswer((invocation) async {
          final dateFrom = invocation.namedArguments[#dateFrom] as DateTime;
          if (dateFrom == DateTime(2026, 1, 15)) {
            return refreshedHistoryPageCompleter.future;
          }

          return const TimeTrackingSessionPage(
            sessions: [TimeTrackingSession(id: 'cached-history-session')],
            hasMore: true,
            nextCursor: 'cached-next-cursor',
          );
        });
        when(
          () => repository.getPeriodStats(
            any(),
            dateFrom: any(named: 'dateFrom'),
            dateTo: any(named: 'dateTo'),
            userId: any(named: 'userId'),
            timezone: any(named: 'timezone'),
          ),
        ).thenAnswer((invocation) async {
          final dateFrom = invocation.namedArguments[#dateFrom] as DateTime;
          if (dateFrom == DateTime(2026, 1, 15)) {
            return const TimeTrackingPeriodStats(
              totalDuration: 600,
              sessionCount: 1,
            );
          }

          return const TimeTrackingPeriodStats(
            totalDuration: 1200,
            sessionCount: 2,
          );
        });
        when(
          () => repository.loadPomodoroSettings(),
        ).thenAnswer((_) async => const PomodoroSettings());
        when(
          () => repository.getWorkspaceSettings(any()),
        ).thenAnswer((_) async => null);

        await cubit.loadData('ws-1', 'user-1');

        expect(
          cubit.state.historySessions.map((session) => session.id),
          ['cached-history-session'],
        );
        expect(cubit.state.historyPeriodStats?.sessionCount, 2);

        clearInteractions(repository);

        final targetDate = DateTime(2026, 1, 15, 14, 30);
        cubit.setHistoryContext(
          viewMode: HistoryViewMode.day,
          anchorDate: targetDate,
        );

        final refreshFuture = cubit.loadData('ws-1', 'user-1');

        for (var i = 0; i < 10 && !cubit.state.isHistoryLoading; i++) {
          await Future<void>.delayed(Duration.zero);
        }

        expect(cubit.state.historyViewMode, HistoryViewMode.day);
        expect(cubit.state.historyAnchorDate, DateTime(2026, 1, 15));
        expect(cubit.state.historySessions, isEmpty);
        expect(cubit.state.historyPeriodStats, isNull);
        expect(cubit.state.historyHasMore, isFalse);
        expect(cubit.state.historyNextCursor, isNull);
        expect(cubit.state.isHistoryLoading, isTrue);
        expect(cubit.state.isHistoryLoadingMore, isFalse);
        expect(cubit.state.isRefreshing, isTrue);

        refreshedHistoryPageCompleter.complete(
          const TimeTrackingSessionPage(
            sessions: [TimeTrackingSession(id: 'refreshed-history-session')],
            hasMore: false,
          ),
        );
        await refreshFuture;

        expect(
          cubit.state.historySessions.map((session) => session.id),
          ['refreshed-history-session'],
        );
        expect(cubit.state.historyPeriodStats?.sessionCount, 1);
        expect(cubit.state.isHistoryLoading, isFalse);
        expect(cubit.state.isRefreshing, isFalse);
      },
    );

    test(
      'loadData stops history loading after a route-context refresh fails',
      () async {
        when(
          () => repository.getRunningSession(any()),
        ).thenAnswer((_) async => null);
        when(
          () => repository.getCategories(any()),
        ).thenAnswer((_) async => const []);
        when(
          () => repository.getSessions(
            any(),
            limit: any(named: 'limit'),
          ),
        ).thenAnswer((_) async => const <TimeTrackingSession>[]);
        when(
          () => repository.getStats(
            any(),
            any(),
            timezone: any(named: 'timezone'),
          ),
        ).thenAnswer((_) async => const TimeTrackerStats());
        when(
          () => repository.getHistorySessions(
            any(),
            dateFrom: any(named: 'dateFrom'),
            dateTo: any(named: 'dateTo'),
            cursor: any(named: 'cursor'),
            limit: any(named: 'limit'),
            userId: any(named: 'userId'),
          ),
        ).thenAnswer((invocation) async {
          final dateFrom = invocation.namedArguments[#dateFrom] as DateTime;
          if (dateFrom == DateTime(2026, 1, 15)) {
            return Future<TimeTrackingSessionPage>.delayed(
              Duration.zero,
              () => throw Exception('history refresh failed'),
            );
          }

          return const TimeTrackingSessionPage(
            sessions: [TimeTrackingSession(id: 'cached-history-session')],
            hasMore: false,
          );
        });
        when(
          () => repository.getPeriodStats(
            any(),
            dateFrom: any(named: 'dateFrom'),
            dateTo: any(named: 'dateTo'),
            userId: any(named: 'userId'),
            timezone: any(named: 'timezone'),
          ),
        ).thenAnswer((_) async => const TimeTrackingPeriodStats());
        when(
          () => repository.loadPomodoroSettings(),
        ).thenAnswer((_) async => const PomodoroSettings());
        when(
          () => repository.getWorkspaceSettings(any()),
        ).thenAnswer((_) async => null);

        await cubit.loadData('ws-1', 'user-1');

        cubit.setHistoryContext(
          viewMode: HistoryViewMode.day,
          anchorDate: DateTime(2026, 1, 15, 14, 30),
        );

        final refreshFuture = cubit.loadData('ws-1', 'user-1');

        for (var i = 0; i < 10 && !cubit.state.isHistoryLoading; i++) {
          await Future<void>.delayed(Duration.zero);
        }

        await refreshFuture;

        expect(cubit.state.historyViewMode, HistoryViewMode.day);
        expect(cubit.state.historyAnchorDate, DateTime(2026, 1, 15));
        expect(cubit.state.historySessions, isEmpty);
        expect(cubit.state.historyPeriodStats, isNull);
        expect(cubit.state.isHistoryLoading, isFalse);
        expect(cubit.state.isHistoryLoadingMore, isFalse);
        expect(cubit.state.isRefreshing, isFalse);
        expect(cubit.state.error, contains('history refresh failed'));
      },
    );
  });

  group('TimeTrackerCubit goal loading behavior', () {
    late _MockTimeTrackerRepository repository;
    late TimeTrackerCubit cubit;

    TimeTrackingGoal buildGoal(String goalId, String wsId) => TimeTrackingGoal(
      id: goalId,
      wsId: wsId,
      userId: 'user-1',
      dailyGoalMinutes: 30,
    );

    setUp(() {
      repository = _MockTimeTrackerRepository();
      cubit = TimeTrackerCubit(repository: repository);
    });

    tearDown(() async {
      await cubit.close();
    });

    test('loadGoals stays scoped to each workspace', () async {
      when(
        () => repository.getGoals(any(), userId: any(named: 'userId')),
      ).thenAnswer((invocation) async {
        final wsId = invocation.positionalArguments[0] as String;
        return [buildGoal('goal-$wsId', wsId)];
      });

      await cubit.loadGoals('ws-1');

      expect(cubit.state.hasLoadedGoalsFor('ws-1'), isTrue);
      expect(cubit.state.hasLoadedGoalsFor('ws-2'), isFalse);

      await cubit.loadGoals('ws-2');

      expect(cubit.state.goalsWorkspaceId, 'ws-2');
      expect(cubit.state.goals.single.id, 'goal-ws-2');
      verify(
        () => repository.getGoals('ws-1', userId: any(named: 'userId')),
      ).called(1);
      verify(
        () => repository.getGoals('ws-2', userId: any(named: 'userId')),
      ).called(1);
    });

    test(
      'loadGoals ignores stale results from an older workspace request',
      () async {
        final ws1Completer = Completer<List<TimeTrackingGoal>>();
        final ws2Completer = Completer<List<TimeTrackingGoal>>();

        when(
          () => repository.getGoals('ws-1', userId: any(named: 'userId')),
        ).thenAnswer((_) => ws1Completer.future);
        when(
          () => repository.getGoals('ws-2', userId: any(named: 'userId')),
        ).thenAnswer((_) => ws2Completer.future);

        final firstLoad = cubit.loadGoals('ws-1');
        final secondLoad = cubit.loadGoals('ws-2');

        ws2Completer.complete([buildGoal('goal-ws-2', 'ws-2')]);
        await secondLoad;

        ws1Completer.complete([buildGoal('goal-ws-1', 'ws-1')]);
        await firstLoad;

        expect(cubit.state.goalsWorkspaceId, 'ws-2');
        expect(cubit.state.goals.single.id, 'goal-ws-2');
        expect(cubit.state.isGoalsLoadingFor('ws-1'), isFalse);
        expect(cubit.state.hasLoadedGoalsFor('ws-1'), isFalse);
        expect(cubit.state.hasLoadedGoalsFor('ws-2'), isTrue);
      },
    );
  });
}
