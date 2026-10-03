import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/data/repositories/inventory_access_repository.dart';
import 'package:mobile/features/inventory/cubit/inventory_access_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements InventoryAccessRepository {}

void main() {
  test(
    'late cached access cannot overwrite another account in the same workspace',
    () async {
      final repository = _Repository();
      var actor = 'a';
      final oldRead = Completer<CacheReadResult<bool>>();
      var reads = 0;
      when(() => repository.readCachedInventoryAccess('ws')).thenAnswer((_) {
        reads++;
        return reads == 1
            ? oldRead.future
            : Future.value(
                const CacheReadResult<bool>(
                  state: CacheEntryState.stale,
                  data: false,
                  hasValue: true,
                  isFromCache: true,
                ),
              );
      });
      when(
        () => repository.isInventoryEnabled('ws'),
      ).thenAnswer((_) async => false);
      final cubit = InventoryAccessCubit(
        repository: repository,
        currentUserId: () => actor,
      );
      addTearDown(cubit.close);
      final first = cubit.syncWorkspace('ws');
      actor = 'b';
      await cubit.syncWorkspace('ws');
      expect(cubit.state.enabled, isFalse);
      oldRead.complete(
        const CacheReadResult<bool>(
          state: CacheEntryState.stale,
          data: true,
          hasValue: true,
          isFromCache: true,
        ),
      );
      await first;
      expect(cubit.state.enabled, isFalse);
      verify(() => repository.isInventoryEnabled('ws')).called(1);
    },
  );

  test('entry revalidates previously loaded workspace access', () async {
    final repository = _Repository();
    var grant = true;
    when(() => repository.readCachedInventoryAccess('ws')).thenAnswer(
      (_) async => const CacheReadResult<bool>(
        state: CacheEntryState.stale,
        data: true,
        hasValue: true,
        isFromCache: true,
      ),
    );
    when(
      () => repository.isInventoryEnabled('ws'),
    ).thenAnswer((_) async => grant);
    final cubit = InventoryAccessCubit(
      repository: repository,
      currentUserId: () => 'a',
    );
    addTearDown(cubit.close);
    await cubit.syncWorkspace('ws');
    expect(cubit.state.enabled, isTrue);
    grant = false;
    await cubit.syncWorkspace('ws');
    expect(cubit.state.enabled, isFalse);
    verify(() => repository.isInventoryEnabled('ws')).called(2);
  });
}
