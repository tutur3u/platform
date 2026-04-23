import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/data/repositories/inventory_access_repository.dart';
import 'package:mobile/features/inventory/cubit/inventory_access_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _MockInventoryAccessRepository extends Mock
    implements InventoryAccessRepository {}

void main() {
  group('InventoryAccessCubit', () {
    late _MockInventoryAccessRepository repository;
    late InventoryAccessCubit cubit;

    setUp(() {
      repository = _MockInventoryAccessRepository();
      cubit = InventoryAccessCubit(repository: repository);
    });

    tearDown(() async {
      await cubit.close();
    });

    blocTest<InventoryAccessCubit, InventoryAccessState>(
      'emits cached access first and keeps it when refresh fails',
      build: () {
        when(
          () => repository.readCachedInventoryAccess('team-1'),
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
          () => repository.isInventoryEnabled('team-1'),
        ).thenThrow(Exception('timeout'));
        return cubit;
      },
      act: (cubit) => cubit.syncWorkspace('team-1'),
      expect: () => const [
        InventoryAccessState(
          status: InventoryAccessStatus.loaded,
          enabled: true,
          wsId: 'team-1',
        ),
      ],
      verify: (_) {
        verify(() => repository.readCachedInventoryAccess('team-1')).called(1);
        verify(() => repository.isInventoryEnabled('team-1')).called(1);
      },
    );

    blocTest<InventoryAccessCubit, InventoryAccessState>(
      'shows loading when no cached access exists',
      build: () {
        when(
          () => repository.readCachedInventoryAccess('team-1'),
        ).thenAnswer(
          (_) async => const CacheReadResult<bool>(
            state: CacheEntryState.missing,
          ),
        );
        when(
          () => repository.isInventoryEnabled('team-1'),
        ).thenAnswer((_) async => true);
        return cubit;
      },
      act: (cubit) => cubit.syncWorkspace('team-1'),
      expect: () => const [
        InventoryAccessState(
          status: InventoryAccessStatus.loading,
          wsId: 'team-1',
        ),
        InventoryAccessState(
          status: InventoryAccessStatus.loaded,
          enabled: true,
          wsId: 'team-1',
        ),
      ],
    );
  });
}
