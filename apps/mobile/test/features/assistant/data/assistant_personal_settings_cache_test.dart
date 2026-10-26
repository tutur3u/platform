import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_soul_receipts.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

import '../assistant_personal_settings_cache_harness.dart';

void main() {
  late PersonalSettingsCacheHarness harness;
  setUp(() async {
    harness = PersonalSettingsCacheHarness();
    await harness.init(initializeStore: false);
  });
  tearDown(() => harness.dispose());

  test('reads the existing verified receipt without reading memory', () async {
    await harness.seed();
    final repository = harness.repository();
    expect((await repository.readCachedSoul())?.name, 'Cached');
    expect(harness.api.gets, isEmpty);
    harness.actor = 'actor-b';
    expect(await repository.readCachedSoul(), isNull);
  });

  test('legacy optimistic data and pending names are never verified', () async {
    await harness.store.write(
      key: const CacheKey(namespace: 'assistant.soul', userId: 'actor-a'),
      policy: CachePolicies.metadata,
      payload: const {'name': 'Legacy optimistic'},
    );
    await harness.store.savePendingMutation(
      PendingMutationRecord(
        id: 'name-intent',
        feature: 'assistant',
        method: 'PATCH',
        path: assistantSoulPath,
        workspaceId: 'personal',
        userId: 'actor-a',
        createdAt: DateTime.utc(2026),
        payload: const {'name': 'Pending'},
      ),
    );
    final repository = harness.repository();
    expect(await repository.readCachedSoul(), isNull);
    await harness.seed();
    expect((await repository.readCachedSoul())?.name, 'Cached');
    expect(
      (await harness.store.listPendingMutations()).single.id,
      'name-intent',
    );
  });

  test('rejects a cache payload whose owner differs from its key', () async {
    await harness.store.write(
      key: verifiedSoulKey('actor-a'),
      policy: CachePolicies.metadata,
      payload: verifiedSoulPayload(
        const AssistantSoul(name: 'Other'),
        'actor-b',
      ),
    );
    final errors = <FlutterErrorDetails>[];
    final previous = FlutterError.onError;
    FlutterError.onError = errors.add;
    try {
      expect(await harness.repository().readCachedSoul(), isNull);
      await harness.drainCache();
      expect(errors.single.exception, isA<FormatException>());
    } finally {
      FlutterError.onError = previous;
    }
  });

  test(
    'fresh load updates only the shared verified personality payload',
    () async {
      await harness.seed();
      final loaded = await harness.repository().load('workspace/a');
      await harness.drainCache();
      expect(loaded.soul.name, 'Fresh');
      expect(loaded.memoryEnabled, isFalse);
      expect(loaded.memories.single.text, 'Remote preference');
      final payload = await harness.store.read<Map<String, dynamic>>(
        key: verifiedSoulKey('actor-a'),
        decode: (json) =>
            Map<String, dynamic>.from(json! as Map<String, dynamic>),
      );
      expect(payload.data, verifiedSoulPayload(loaded.soul, 'actor-a'));
      expect(
        payload.data!.keys,
        unorderedEquals(['schema', 'ownerId', 'soul']),
      );
      expect(harness.api.gets, [
        assistantSoulPath,
        '/api/v1/workspaces/workspace%2Fa/ai/memory/settings?product=mira',
        '/api/v1/workspaces/workspace%2Fa/ai/memory/items?product=mira',
      ]);
    },
  );

  test('held cache initialization cannot delay the fresh API result', () async {
    harness.cacheGate = Completer<void>();
    final repository = harness.repository();
    final cached = repository.readCachedSoul();
    final loaded = await repository.load('workspace');
    expect(loaded.soul.name, 'Fresh');
    expect(harness.api.gets, hasLength(3));
    harness.cacheGate!.complete();
    await cached;
    await harness.drainCache();
  });

  test('cache initialization failure cannot fail a fresh read', () async {
    harness.failCache = true;
    final repository = harness.repository();
    await expectLater(repository.readCachedSoul(), throwsStateError);
    final loaded = await repository.load('workspace');
    expect(loaded.soul.name, 'Fresh');
    harness.failCache = false;
    await harness.drainCache();
  });

  test(
    'failed persistence retains the last verified snapshot and fresh result',
    () async {
      await harness.seed();
      harness.checkpoint = (stage) async {
        if (stage == 'snapshot') {
          throw StateError('Synthetic publication failure');
        }
      };
      final loaded = await harness.repository().load('workspace');
      await harness.drainCache();
      expect(loaded.soul.name, 'Fresh');
      expect((await harness.cachedSoul())?.name, 'Cached');
    },
  );

  test('a different actor cannot dispatch a personality request', () async {
    harness.actor = 'actor-b';
    await expectLater(
      harness.repository().saveSoul(const AssistantSoul(name: 'Edited')),
      throwsStateError,
    );
    expect(harness.api.patches, isEmpty);
  });

  for (final status in [401, 403, 404]) {
    test(
      'definitive $status purges the verified key and retains the API error',
      () async {
        await harness.seed();
        final repository = harness.repository();
        final error = ApiException(
          message: 'Synthetic denial',
          statusCode: status,
        );
        harness.api.soul = () async => throw error;
        await expectLater(repository.load('workspace'), throwsA(same(error)));
        expect(await repository.readCachedSoul(), isNull);
        await harness.drainCache();
        expect(await harness.cachedSoul(), isNull);
        expect(await harness.repository().readCachedSoul(), isNull);
      },
    );
  }

  for (final error in [
    const ApiException.transport(message: 'Synthetic offline'),
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
    test(
      '${error.message} retains the verified snapshot without claiming success',
      () async {
        await harness.seed();
        final repository = harness.repository();
        harness.api.soul = () async => throw error;
        await expectLater(repository.load('workspace'), throwsA(same(error)));
        await harness.drainCache();
        expect((await repository.readCachedSoul())?.name, 'Cached');
      },
    );
  }

  test('memory failure cannot cache or invent a consent value', () async {
    harness.api.memory = (_) async => throw const ApiException.transport(
      message: 'Synthetic memory unavailable',
    );
    final loaded = await harness.repository().load('workspace');
    await harness.drainCache();
    expect(loaded.memoryEnabled, isNull);
    expect(loaded.memories, isEmpty);
    expect(loaded.products, isEmpty);
    expect((await harness.cachedSoul())?.name, 'Fresh');
    expect(await harness.store.listPendingMutations(), isEmpty);
  });

  test(
    'full personality save failure never queues or confirms the edit',
    () async {
      await harness.seed();
      const error = ApiException.transport(message: 'Synthetic unknown write');
      harness.api.write = (_) async => throw error;
      await expectLater(
        harness.repository().saveSoul(
          const AssistantSoul(name: 'Edited', tone: 'warm'),
        ),
        throwsA(same(error)),
      );
      expect(harness.api.patches.single.$2, {'name': 'Edited', 'tone': 'warm'});
      expect((await harness.cachedSoul())?.name, 'Cached');
      expect(await harness.store.listPendingMutations(), isEmpty);
    },
  );

  test(
    'malformed or foreign fresh receipts preserve the previous cache',
    () async {
      await harness.seed();
      for (final receipt in [
        <String, dynamic>{},
        <String, dynamic>{'name': 'Other', 'user_id': 'actor-b'},
      ]) {
        harness.api.soul = () async => {'soul': receipt};
        await expectLater(
          harness.repository().load('workspace'),
          throwsFormatException,
        );
        expect((await harness.cachedSoul())?.name, 'Cached');
      }
    },
  );

  test(
    'an older read cannot replace a newer confirmed save in the cache',
    () async {
      await harness.seed();
      final held = Completer<Map<String, dynamic>>();
      harness.api.soul = () => held.future;
      final repository = harness.repository();
      final oldRead = repository.load('workspace');
      final rejected = expectLater(oldRead, throwsStateError);
      expect(
        (await repository.saveSoul(const AssistantSoul(name: 'Saved'))).name,
        'Saved',
      );
      held.complete({
        'soul': const {'name': 'Old'},
      });
      await rejected;
      await harness.drainCache();
      expect((await harness.cachedSoul())?.name, 'Saved');
    },
  );

  test(
    'definitive save denial purges rather than confirming or queueing',
    () async {
      await harness.seed();
      const error = ApiException(message: 'Synthetic denial', statusCode: 403);
      harness.api.write = (_) async => throw error;
      await expectLater(
        harness.repository().saveSoul(const AssistantSoul(name: 'Edited')),
        throwsA(same(error)),
      );
      await harness.drainCache();
      expect(await harness.cachedSoul(), isNull);
      expect(await harness.store.listPendingMutations(), isEmpty);
    },
  );

  test('logout and same-actor restore fence a held network receipt', () async {
    await harness.seed();
    final held = Completer<Map<String, dynamic>>();
    harness.api.soul = () => held.future;
    final pending = harness.repository().load('workspace');
    final rejected = expectLater(pending, throwsStateError);
    harness.actor = null;
    await harness.store.clearResources(userId: 'actor-a');
    harness.actor = 'actor-a';
    held.complete({
      'soul': const {'name': 'Old'},
    });
    await rejected;
    expect(await harness.cachedSoul(), isNull);
  });
}
