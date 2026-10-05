import 'dart:async';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/features/assistant/local/assistant_local_history.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

AssistantMessage _message(String text) => AssistantMessage(
  id: text,
  role: 'user',
  parts: [AssistantMessagePart(type: 'text', text: text)],
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  Future<void> Function(String)? checkpoint;
  setUp(() async {
    checkpoint = null;
    directory = await Directory.systemTemp.createTemp('local-history-test-');
    final storage = _Storage();
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((_) async => null);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((_) async {});
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
      persistenceCheckpoint: (stage) => checkpoint?.call(stage),
    );
  });
  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  test('encrypted local history isolates actor, workspace and model', () async {
    final history = AssistantLocalHistory(cache: store);
    await history.save(
      actor: 'one',
      workspace: 'workspace',
      model: 'gemma',
      messages: [_message('Private')],
      isScopeCurrent: () => true,
    );
    Future<List<AssistantMessage>> read(
      String actor,
      String workspace,
      String model,
    ) => history.load(
      actor: actor,
      workspace: workspace,
      model: model,
      isScopeCurrent: () => true,
    );
    expect(
      (await read('one', 'workspace', 'gemma')).single.parts.single.text,
      'Private',
    );
    expect(await read('two', 'workspace', 'gemma'), isEmpty);
    expect(await read('one', 'another', 'gemma'), isEmpty);
    expect(await read('one', 'workspace', 'qwen'), isEmpty);
    await history.clear(
      actor: 'one',
      workspace: 'workspace',
      model: 'gemma',
      isScopeCurrent: () => true,
    );
    expect(await read('one', 'workspace', 'gemma'), isEmpty);
  });

  test('session invalidation during durable publication rejects '
      'late private history', () async {
    final history = AssistantLocalHistory(cache: store);
    var current = true;
    final reached = Completer<void>();
    final release = Completer<void>();
    checkpoint = (stage) async {
      if (stage == 'snapshot') {
        reached.complete();
        await release.future;
      }
    };
    final writing = history.save(
      actor: 'one',
      workspace: 'workspace',
      model: 'gemma',
      messages: [_message('Stale private')],
      isScopeCurrent: () => current,
    );
    final rejected = expectLater(writing, throwsStateError);
    await reached.future;
    current = false;
    release.complete();
    await rejected;
    checkpoint = null;
    expect(
      await history.load(
        actor: 'one',
        workspace: 'workspace',
        model: 'gemma',
        isScopeCurrent: () => true,
      ),
      isEmpty,
    );
  });

  test(
    'history budget retains newest messages without forwarding old context',
    () {
      final messages = List.generate(40, (index) => _message('$index'));
      final selected = boundedLocalHistory(messages);
      expect(selected.length, 32);
      expect(selected.first.id, '8');
      expect(selected.last.id, '39');
      expect(boundedLocalHistory([_message('x' * 64001)]), isEmpty);
    },
  );
}
