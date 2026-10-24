import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_personal_settings_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_memory_edit.dart';
import 'package:mobile/features/assistant/data/assistant_personal_settings_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

import '../assistant_personal_settings_harness.dart';

class _CachedRepository extends SettingsRepository {
  Future<AssistantSoul?> Function() cached = () async =>
      const AssistantSoul(name: 'Cached');
  @override
  Future<AssistantSoul?> readCachedSoul() => cached();
}

void main() {
  late _CachedRepository repository;
  late AssistantPersonalSettingsCubit cubit;
  late String actor;
  late bool scope;
  setUp(() {
    repository = _CachedRepository();
    actor = 'actor-a';
    scope = true;
    cubit = AssistantPersonalSettingsCubit(
      workspaceId: 'workspace-a',
      repository: repository,
      isScopeCurrent: () => scope,
      currentUserId: () => actor,
    );
  });
  tearDown(() => cubit.close());

  test(
    'shows cached personality before the fresh read with unknown consent',
    () async {
      final held = Completer<AssistantPersonalSettingsSnapshot>();
      repository.read = () => held.future;
      final displayed = cubit.stream.firstWhere(
        (state) => state.snapshot != null,
      );
      final loading = cubit.load();
      expect((await displayed).snapshot!.soul.name, 'Cached');
      expect(cubit.state.snapshot!.memoryEnabled, isNull);
      expect(cubit.state.snapshot!.memories, isEmpty);
      expect(cubit.state.snapshot!.products, isEmpty);
      expect(cubit.state.loading, isTrue);
      expect(await cubit.setMemoryEnabled(enabled: true), isFalse);
      expect(await cubit.exportMemories(), isNull);
      expect(repository.writes, 0);
      held.complete(snapshot);
      await loading;
      expect(cubit.state.snapshot, same(snapshot));
      expect(cubit.state.loading, isFalse);
    },
  );

  test(
    'transport failure retains the cached personality and exact failure',
    () async {
      const error = ApiException.transport(message: 'Synthetic offline');
      repository.read = () async => throw error;
      final displayed = cubit.stream.firstWhere(
        (state) => state.snapshot != null,
      );
      await cubit.load();
      await displayed;
      expect(cubit.state.snapshot!.soul.name, 'Cached');
      expect(cubit.state.failed, isTrue);
      expect(cubit.state.error, same(error));
    },
  );

  for (final error in [
    const ApiException(message: 'Synthetic denial', statusCode: 403),
    const ApiException(message: 'Synthetic missing', statusCode: 404),
  ]) {
    test(
      '${error.statusCode} clears visible values and fences a late cache',
      () async {
        await cubit.load();
        final cache = Completer<AssistantSoul?>();
        repository
          ..cached = (() => cache.future)
          ..read = () async => throw error;
        await cubit.load();
        expect(cubit.state.snapshot, isNull);
        cache.complete(const AssistantSoul(name: 'Late cache'));
        await Future<void>.delayed(Duration.zero);
        expect(cubit.state.snapshot, isNull);
        expect(cubit.state.error, same(error));
      },
    );
  }

  for (final error in [
    const ApiException(
      message: 'Synthetic MFA',
      statusCode: 403,
      code: 'MFA_REQUIRED',
    ),
    const ApiException(
      message: 'Synthetic challenge',
      statusCode: 403,
      isVerificationRequired: true,
    ),
  ]) {
    test('${error.message} retains values and the challenge', () async {
      await cubit.load();
      repository.read = () async => throw error;
      await cubit.load();
      expect(cubit.state.snapshot, same(snapshot));
      expect(cubit.state.error, same(error));
      expect(cubit.state.failed, isTrue);
    });
  }

  test('a held or failed cache never blocks the fresh read', () async {
    final cache = Completer<AssistantSoul?>();
    repository.cached = () => cache.future;
    await cubit.load();
    expect(cubit.state.snapshot, same(snapshot));
    cache.completeError(StateError('Synthetic cache unavailable'));
    await Future<void>.delayed(Duration.zero);
    expect(cubit.state.snapshot, same(snapshot));
    expect(cubit.state.failed, isFalse);
  });

  test('cache arriving after transport failure retains that failure', () async {
    final cache = Completer<AssistantSoul?>();
    repository.cached = () => cache.future;
    const error = ApiException.transport(message: 'Synthetic offline');
    repository.read = () async => throw error;
    await cubit.load();
    expect(cubit.state.snapshot, isNull);
    final displayed = cubit.stream.firstWhere(
      (state) => state.snapshot != null,
    );
    cache.complete(const AssistantSoul(name: 'Cached'));
    await displayed;
    expect(cubit.state.snapshot!.soul.name, 'Cached');
    expect(cubit.state.failed, isTrue);
    expect(cubit.state.error, same(error));
  });

  test('late cache cannot replace fresh values or a confirmed write', () async {
    final cache = Completer<AssistantSoul?>();
    repository.cached = () => cache.future;
    await cubit.load();
    expect(await cubit.saveSoul(const AssistantSoul(name: 'Saved')), isTrue);
    cache.complete(const AssistantSoul(name: 'Old'));
    await Future<void>.delayed(Duration.zero);
    expect(cubit.state.snapshot!.soul.name, 'Saved');
  });

  test(
    'late refresh cannot overwrite an edit begun from cached personality',
    () async {
      final held = Completer<AssistantPersonalSettingsSnapshot>();
      repository.read = () => held.future;
      final displayed = cubit.stream.firstWhere(
        (state) => state.snapshot != null,
      );
      final loading = cubit.load();
      await displayed;
      expect(await cubit.saveSoul(const AssistantSoul(name: 'Saved')), isTrue);
      held.complete(snapshot);
      await loading;
      expect(cubit.state.snapshot!.soul.name, 'Saved');
      expect(cubit.state.snapshot!.memoryEnabled, isNull);
    },
  );

  test('confirmed memory edits retain the existing refresh fence', () async {
    await cubit.load();
    final held = Completer<AssistantPersonalSettingsSnapshot>();
    repository.read = () => held.future;
    final loading = cubit.load();
    cubit.applyConfirmedMemoryEdit(
      EditableAssistantMemory(
        id: 'memory-a',
        content: 'Confirmed edit',
        revision: 'v1:${'b' * 32}',
      ),
    );
    held.complete(snapshot);
    await loading;
    expect(cubit.state.snapshot!.memories.single.text, 'Confirmed edit');
  });

  test('closing the editor rejects late cache and fresh responses', () async {
    final cache = Completer<AssistantSoul?>();
    final fresh = Completer<AssistantPersonalSettingsSnapshot>();
    repository
      ..cached = (() => cache.future)
      ..read = () => fresh.future;
    final loading = cubit.load();
    await cubit.close();
    cache.complete(const AssistantSoul(name: 'Cached'));
    fresh.complete(snapshot);
    await loading;
    expect(cubit.state.snapshot, isNull);
  });

  test('actor ABA cannot revive a held cached snapshot', () async {
    final cache = Completer<AssistantSoul?>();
    final fresh = Completer<AssistantPersonalSettingsSnapshot>();
    repository
      ..cached = (() => cache.future)
      ..read = () => fresh.future;
    final loading = cubit.load();
    actor = 'actor-b';
    expect(cubit.admitted, isFalse);
    actor = 'actor-a';
    cache.complete(const AssistantSoul(name: 'Old'));
    fresh.complete(snapshot);
    await loading;
    expect(cubit.state.snapshot, isNull);
    expect(await cubit.saveSoul(const AssistantSoul(name: 'Edited')), isFalse);
    expect(repository.writes, 0);
  });

  test(
    'workspace invalidation rejects held cache and fresh responses',
    () async {
      final cache = Completer<AssistantSoul?>();
      final fresh = Completer<AssistantPersonalSettingsSnapshot>();
      repository
        ..cached = (() => cache.future)
        ..read = () => fresh.future;
      final loading = cubit.load();
      scope = false;
      expect(cubit.admitted, isFalse);
      scope = true;
      cache.complete(const AssistantSoul(name: 'Old'));
      fresh.complete(snapshot);
      await loading;
      expect(cubit.state.snapshot, isNull);
    },
  );

  test(
    'write denial erases values while MFA keeps the previous snapshot',
    () async {
      await cubit.load();
      const challenge = ApiException(
        message: 'Synthetic MFA',
        statusCode: 403,
        code: 'MFA_REQUIRED',
      );
      repository.write = (_) async => throw challenge;
      expect(
        await cubit.saveSoul(const AssistantSoul(name: 'Edited')),
        isFalse,
      );
      expect(cubit.state.snapshot, same(snapshot));
      expect(cubit.state.error, same(challenge));
      const denial = ApiException(message: 'Synthetic denial', statusCode: 403);
      repository.write = (_) async => throw denial;
      expect(
        await cubit.saveSoul(const AssistantSoul(name: 'Edited')),
        isFalse,
      );
      expect(cubit.state.snapshot, isNull);
      expect(cubit.state.error, same(denial));
    },
  );
}
