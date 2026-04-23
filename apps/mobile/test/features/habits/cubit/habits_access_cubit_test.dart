import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/data/repositories/habits_access_repository.dart';
import 'package:mobile/features/habits/cubit/habits_access_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _MockHabitsAccessRepository extends Mock
    implements HabitsAccessRepository {}

void main() {
  group('HabitsAccessCubit', () {
    late _MockHabitsAccessRepository repository;
    late HabitsAccessCubit cubit;

    setUp(() {
      repository = _MockHabitsAccessRepository();
      cubit = HabitsAccessCubit(repository: repository);
    });

    tearDown(() async {
      await cubit.close();
    });

    blocTest<HabitsAccessCubit, HabitsAccessState>(
      'emits cached access first and keeps it when refresh fails',
      build: () {
        when(
          () => repository.readCachedHabitsAccess('team-1'),
        ).thenAnswer(
          (_) async => CacheReadResult<bool>(
            state: CacheEntryState.stale,
            data: true,
            fetchedAt: DateTime(2026),
            isFromCache: true,
            hasValue: true,
          ),
        );
        when(
          () => repository.isHabitsEnabled('team-1'),
        ).thenThrow(Exception('timeout'));
        return cubit;
      },
      act: (cubit) => cubit.syncWorkspace('team-1'),
      expect: () => const [
        HabitsAccessState(
          status: HabitsAccessStatus.loaded,
          enabled: true,
          wsId: 'team-1',
        ),
      ],
      verify: (_) {
        verify(() => repository.readCachedHabitsAccess('team-1')).called(1);
        verify(() => repository.isHabitsEnabled('team-1')).called(1);
      },
    );

    blocTest<HabitsAccessCubit, HabitsAccessState>(
      'shows loading when no cached access exists',
      build: () {
        when(
          () => repository.readCachedHabitsAccess('team-1'),
        ).thenAnswer(
          (_) async => const CacheReadResult<bool>(
            state: CacheEntryState.missing,
          ),
        );
        when(
          () => repository.isHabitsEnabled('team-1'),
        ).thenAnswer((_) async => true);
        return cubit;
      },
      act: (cubit) => cubit.syncWorkspace('team-1'),
      expect: () => const [
        HabitsAccessState(
          status: HabitsAccessStatus.loading,
          wsId: 'team-1',
        ),
        HabitsAccessState(
          status: HabitsAccessStatus.loaded,
          enabled: true,
          wsId: 'team-1',
        ),
      ],
    );
  });
}
