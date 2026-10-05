import 'dart:async';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/repositories/education_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _Api extends Mock implements ApiClient {}

class _Queue extends Mock implements OfflineMutationQueue {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  late _Api api;
  late _Queue queue;
  late EducationRepository repository;
  late String actor;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('education-actor-');
    final storage = _Storage();
    final secrets = <String, String>{};
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((call) async => secrets[call.namedArguments[#key] as String]);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      secrets[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String;
    });
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
    api = _Api();
    queue = _Queue();
    actor = 'owner';
    when(() => api.checkUser(any())).thenAnswer((call) {
      if (call.positionalArguments.single != actor) {
        throw const ApiException(message: 'Account changed', statusCode: 401);
      }
    });
    repository = EducationRepository(
      apiClient: api,
      cacheStore: store,
      mutationQueue: queue,
      expectedUserId: 'owner',
    );
  });
  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  for (final section in ['courses', 'quiz-sets', 'quizzes', 'flashcards']) {
    final path = switch (section) {
      'courses' => EducationEndpoints.courses('ws', page: 1, pageSize: 20),
      'quiz-sets' => EducationEndpoints.quizSets('ws', page: 1, pageSize: 20),
      'quizzes' => EducationEndpoints.quizzes('ws', page: 1, pageSize: 20),
      _ => EducationEndpoints.flashcards('ws', page: 1, pageSize: 20),
    };
    Future<List<String>> read() => CacheStore.awaitRevalidation(
      () async => switch (section) {
        'courses' => (await repository.getCourses(
          'ws',
        )).items.map((r) => r.id).toList(),
        'quiz-sets' => (await repository.getQuizSets(
          'ws',
        )).items.map((r) => r.id).toList(),
        'quizzes' => (await repository.getQuizzes(
          'ws',
        )).items.map((r) => r.id).toList(),
        _ => (await repository.getFlashcards(
          'ws',
        )).items.map((r) => r.id).toList(),
      },
    );
    PendingMutationRecord pending(String user, String id) =>
        PendingMutationRecord(
          id: id,
          feature: 'education',
          method: 'POST',
          path: path,
          userId: user,
          workspaceId: 'ws',
          createdAt: DateTime.utc(2026),
          optimisticPatch: {'entityId': id},
          payload: section == 'quizzes'
              ? {
                  'quizzes': [
                    {'id': id, 'question': id},
                  ],
                }
              : {'id': id, 'name': id, 'front': id, 'back': id},
        );
    test('$section overlays only the captured actor edits', () async {
      repository = EducationRepository(
        apiClient: api,
        cacheStore: store,
        mutationQueue: queue,
        currentUserId: () => actor,
      );
      when(
        () => api.getJson(path),
      ).thenAnswer((_) async => {'data': <dynamic>[], 'count': 0});
      when(() => queue.listPending()).thenAnswer(
        (_) async => [pending('owner', 'mine'), pending('other', 'private')],
      );
      expect(await read(), ['mine']);
    });
    test(
      '$section fences an actor change while reading pending edits',
      () async {
        repository = EducationRepository(
          apiClient: api,
          cacheStore: store,
          mutationQueue: queue,
          currentUserId: () => actor,
        );
        final entered = Completer<void>();
        final result = Completer<List<PendingMutationRecord>>();
        when(
          () => api.getJson(path),
        ).thenAnswer((_) async => {'data': <dynamic>[]});
        when(() => queue.listPending()).thenAnswer((_) {
          entered.complete();
          return result.future;
        });
        final reading = read();
        final assertion = expectLater(reading, throwsA(isA<ApiException>()));
        await entered.future;
        actor = 'other';
        result.complete([pending('owner', 'mine')]);
        await assertion;
      },
    );
    test('$section rejects a late response from the original actor', () async {
      repository = EducationRepository(
        apiClient: api,
        cacheStore: store,
        mutationQueue: queue,
        currentUserId: () => actor,
      );
      final entered = Completer<void>();
      final result = Completer<Map<String, dynamic>>();
      when(() => api.getJson(path)).thenAnswer((_) {
        entered.complete();
        return result.future;
      });
      final reading = read();
      final assertion = expectLater(reading, throwsA(isA<ApiException>()));
      await entered.future;
      actor = 'other';
      result.complete({'data': <dynamic>[]});
      await assertion;
      verifyNever(() => queue.listPending());
    });
  }
  for (final detail in [false, true]) {
    final label = detail ? 'detail' : 'attempts';
    test('$label anonymous request cannot publish after sign-in', () async {
      String? cacheActor;
      repository = EducationRepository(
        apiClient: api,
        cacheStore: store,
        mutationQueue: queue,
        currentUserId: () => cacheActor,
      );
      final entered = Completer<void>();
      final response = Completer<Map<String, dynamic>>();
      final path = detail
          ? EducationEndpoints.attempt('ws', 'id')
          : EducationEndpoints.attempts(
              'ws',
              page: 1,
              pageSize: 20,
              status: 'all',
              sortBy: 'newest',
              sortDirection: 'desc',
            );
      when(() => api.getJson(path)).thenAnswer((_) {
        entered.complete();
        return response.future;
      });
      final Future<Object> reading = detail
          ? repository.getAttemptDetail('ws', 'id')
          : repository.getAttempts('ws');
      final assertion = expectLater(reading, throwsA(isA<ApiException>()));
      await entered.future;
      cacheActor = 'owner';
      response.complete({});
      await assertion;
    });
  }
  test('anonymous writes cannot reach queue admission', () async {
    repository = EducationRepository(
      apiClient: api,
      cacheStore: store,
      mutationQueue: queue,
      currentUserId: () => null,
    );
    await expectLater(
      repository.createCourse('ws', name: 'Draft'),
      throwsA(isA<ApiException>()),
    );
    verifyNever(() => api.postJson(any(), any()));
  });
  test('bound departed actor cannot begin a write', () async {
    actor = 'other';
    await expectLater(
      repository.createCourse('ws', name: 'Draft'),
      throwsA(isA<ApiException>()),
    );
    verifyNever(() => api.postJson(any(), any()));
  });
}
