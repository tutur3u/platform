import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/repositories/habit_tracker_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/habits/cubit/habits_cubit.dart';
import 'package:mobile/features/habits/cubit/habits_state.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements IHabitTrackerRepository {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Repository repository;
  late HabitsCubit cubit;
  late String actor;
  final empty = HabitTrackerListResponse.fromJson(const {
    'trackers': <dynamic>[],
  });

  setUpAll(() {
    registerFallbackValue(HabitTrackerScope.self);
  });
  setUp(() async {
    HabitsCubit.clearCache();
    await CacheStore.instance.clearScope();
    repository = _Repository();
    actor = 'owner';
    cubit = HabitsCubit(
      repository: repository,
      actorId: 'owner',
      currentUserId: () => actor,
    );
  });
  tearDown(() async {
    if (!cubit.isClosed) await cubit.close();
  });

  test('late list cannot publish after actor changes', () async {
    final response = Completer<HabitTrackerListResponse>();
    final entered = Completer<void>();
    when(
      () => repository.listTrackers(
        'ws',
        scope: any(named: 'scope'),
        userId: any(named: 'userId'),
      ),
    ).thenAnswer((_) {
      entered.complete();
      return response.future;
    });
    final loading = cubit.loadWorkspace('ws');
    await entered.future;
    actor = 'other';
    response.complete(empty);
    await loading;
    expect(cubit.state.status, HabitsStatus.loading);
    expect(cubit.state.listResponse, isNull);
    expect(HabitsCubit.cachedStateForWorkspace('ws', actorId: 'other'), isNull);
  });

  test('late list after close completes without emitting', () async {
    final response = Completer<HabitTrackerListResponse>();
    final entered = Completer<void>();
    when(
      () => repository.listTrackers(
        'ws',
        scope: any(named: 'scope'),
        userId: any(named: 'userId'),
      ),
    ).thenAnswer((_) {
      entered.complete();
      return response.future;
    });
    final loading = cubit.loadWorkspace('ws');
    await entered.future;
    await cubit.close();
    response.complete(empty);
    await loading;
    expect(cubit.state.listResponse, isNull);
  });

  test('new workspace supersedes an earlier disk and network load', () async {
    final response = Completer<HabitTrackerListResponse>();
    final entered = Completer<void>();
    when(
      () => repository.listTrackers(
        'old',
        scope: any(named: 'scope'),
        userId: any(named: 'userId'),
      ),
    ).thenAnswer((_) {
      entered.complete();
      return response.future;
    });
    when(
      () => repository.listTrackers(
        'new',
        scope: any(named: 'scope'),
        userId: any(named: 'userId'),
      ),
    ).thenAnswer((_) async => empty);
    final loading = cubit.loadWorkspace('old');
    await entered.future;
    await cubit.loadWorkspace('new');
    response.complete(empty);
    await loading;
    expect(cubit.state.activeWorkspaceId, 'new');
    expect(cubit.state.status, HabitsStatus.loaded);
  });

  test('departed account cannot start a habit write', () async {
    actor = 'other';
    await expectLater(
      cubit.archiveTracker('tracker'),
      throwsA(isA<ApiException>()),
    );
    verifyNever(() => repository.archiveTracker(any(), any()));
  });

  test('late archive never reloads a newly selected workspace', () async {
    await cubit.close();
    cubit = HabitsCubit(
      repository: repository,
      actorId: 'owner',
      currentUserId: () => actor,
      initialState: HabitsState(
        activeWorkspaceId: 'old',
        listResponse: empty,
        status: HabitsStatus.loaded,
      ),
    );
    final response = Completer<void>();
    when(
      () => repository.archiveTracker('old', 'tracker'),
    ).thenAnswer((_) => response.future);
    when(
      () => repository.listTrackers(
        'new',
        scope: any(named: 'scope'),
        userId: any(named: 'userId'),
      ),
    ).thenAnswer((_) async => empty);
    final writing = cubit.archiveTracker('tracker');
    await cubit.loadWorkspace('new');
    response.complete();
    await writing;
    verify(
      () => repository.listTrackers(
        'new',
        scope: any(named: 'scope'),
        userId: any(named: 'userId'),
      ),
    ).called(1);
    expect(cubit.state.activeWorkspaceId, 'new');
    expect(cubit.state.isArchivingTracker, isFalse);
  });
  test(
    'old archive cannot finish a new mutation after workspace away and back',
    () async {
      await cubit.close();
      cubit = HabitsCubit(
        repository: repository,
        actorId: 'owner',
        currentUserId: () => actor,
        initialState: HabitsState(
          activeWorkspaceId: 'old',
          listResponse: empty,
          status: HabitsStatus.loaded,
        ),
      );
      final first = Completer<void>();
      final second = Completer<void>();
      when(
        () => repository.archiveTracker('old', 'first'),
      ).thenAnswer((_) => first.future);
      when(
        () => repository.archiveTracker('old', 'second'),
      ).thenAnswer((_) => second.future);
      when(
        () => repository.listTrackers(
          any(),
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
        ),
      ).thenAnswer((_) async => empty);
      final oldWrite = cubit.archiveTracker('first');
      await cubit.loadWorkspace('new');
      await cubit.loadWorkspace('old');
      final newWrite = cubit.archiveTracker('second');
      first.complete();
      await oldWrite;
      expect(cubit.state.isArchivingTracker, isTrue);
      verify(
        () => repository.listTrackers(
          'old',
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
        ),
      ).called(1);
      second.complete();
      await newWrite;
      expect(cubit.state.isArchivingTracker, isFalse);
    },
  );
}
