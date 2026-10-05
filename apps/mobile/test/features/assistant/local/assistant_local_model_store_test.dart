// Mirror the production store's asynchronous filesystem behavior.
// ignore_for_file: avoid_slow_async_io

import 'dart:async';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_local_model_store.dart';

void main() {
  late Directory directory;
  const bytes = [1, 2, 3, 4];
  late AssistantLocalModel model;
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('mira-model-test-');
    model = AssistantLocalModel(
      id: 'test-model',
      name: 'Test',
      repository: 'test/model',
      revision: 'abc',
      filename: 'model.litertlm',
      sha256: sha256.convert(bytes).toString(),
      bytes: bytes.length,
      licenseUrl: 'https://example.com/license',
    );
  });
  tearDown(() => directory.delete(recursive: true));

  AssistantLocalModelStore store({List<int> body = bytes, int budget = 100}) =>
      AssistantLocalModelStore(
        directory: () async => directory,
        models: [model],
        budgetBytes: budget,
        client: () => MockClient((request) async {
          expect(request.url, model.downloadUri);
          expect(request.headers.containsKey('authorization'), isFalse);
          return http.Response.bytes(body, 200);
        }),
      );

  test(
    'publishes only exact digest and revision; revalidates stored bytes',
    () async {
      final files = store();
      final installed = await files.download(
        model,
        isScopeCurrent: () => true,
        onProgress: (_, _) {},
      );
      expect(await installed.readAsBytes(), bytes);
      expect(await files.verifiedFile(model), isNotNull);
      await installed.writeAsBytes([4, 3, 2, 1]);
      expect(await files.verifiedFile(model), isNull);
    },
  );

  test(
    'same-length corrupt response does not replace installed weights',
    () async {
      final installed = File('${directory.path}/${model.id}.litertlm');
      await installed.writeAsBytes(bytes);
      await expectLater(
        store(
          body: [4, 3, 2, 1],
        ).download(model, isScopeCurrent: () => true, onProgress: (_, _) {}),
        throwsA(
          isA<LocalModelException>().having(
            (e) => e.reason,
            'reason',
            LocalModelFailure.integrity,
          ),
        ),
      );
      expect(await installed.readAsBytes(), bytes);
      expect(await File('${installed.path}.part').exists(), isFalse);
    },
  );

  test('budget includes old file during atomic replacement', () async {
    await File('${directory.path}/${model.id}.litertlm').writeAsBytes(bytes);
    await expectLater(
      store(
        budget: 7,
      ).download(model, isScopeCurrent: () => true, onProgress: (_, _) {}),
      throwsA(
        isA<LocalModelException>().having(
          (e) => e.reason,
          'reason',
          LocalModelFailure.budget,
        ),
      ),
    );
  });

  test('actor change before publication erases partial file', () async {
    var current = true;
    final files = store();
    await expectLater(
      files.download(
        model,
        isScopeCurrent: () => current,
        onProgress: (_, _) => current = false,
      ),
      throwsA(
        isA<LocalModelException>().having(
          (e) => e.reason,
          'reason',
          LocalModelFailure.cancelled,
        ),
      ),
    );
    expect(await directory.list().toList(), isEmpty);
  });

  test('cleanup fault preserves integrity and releases lease', () async {
    final files = AssistantLocalModelStore(
      directory: () async => directory,
      models: [model],
      client: () =>
          MockClient((_) async => http.Response.bytes([4, 3, 2, 1], 200)),
      deletePartial: (_) async => throw const FileSystemException('disk fault'),
    );
    await expectLater(
      files.download(model, isScopeCurrent: () => true, onProgress: (_, _) {}),
      throwsA(
        isA<LocalModelException>().having(
          (error) => error.reason,
          'reason',
          LocalModelFailure.integrity,
        ),
      ),
    );
    // A different store can acquire the process-wide lease after cleanup fails.
    await store().download(
      model,
      isScopeCurrent: () => true,
      onProgress: (_, _) {},
    );
    expect(await store().verifiedFile(model), isNotNull);
  });

  test('remove reserves lease before asynchronous file lookup', () async {
    final admitted = Completer<void>();
    final released = Completer<Directory>();
    await File('${directory.path}/${model.id}.litertlm').writeAsBytes(bytes);
    final files = AssistantLocalModelStore(
      directory: () {
        admitted.complete();
        return released.future;
      },
      models: [model],
    );
    final removal = files.remove(model);
    await admitted.future;
    await expectLater(
      store().download(
        model,
        isScopeCurrent: () => true,
        onProgress: (_, _) {},
      ),
      throwsA(
        isA<LocalModelException>().having(
          (error) => error.reason,
          'reason',
          LocalModelFailure.busy,
        ),
      ),
    );
    released.complete(directory);
    await removal;
    await store().download(
      model,
      isScopeCurrent: () => true,
      onProgress: (_, _) {},
    );
    expect(await store().verifiedFile(model), isNotNull);
  });

  test('licensed models require an explicit verified file import', () async {
    final gated = AssistantLocalModel(
      id: model.id,
      name: model.name,
      repository: model.repository,
      revision: model.revision,
      filename: model.filename,
      sha256: model.sha256,
      bytes: model.bytes,
      licenseUrl: model.licenseUrl,
      requiresLicensedImport: true,
    );
    final files = AssistantLocalModelStore(
      directory: () async => directory,
      models: [gated],
    );
    await expectLater(
      files.download(gated, isScopeCurrent: () => true, onProgress: (_, _) {}),
      throwsA(isA<LocalModelException>()),
    );
    final source = File('${directory.path}/import.litertlm');
    await source.writeAsBytes(bytes);
    expect(
      await files.importFile(
        gated,
        source,
        isScopeCurrent: () => true,
        onProgress: (_, _) {},
      ),
      isA<File>(),
    );
  });

  test(
    'cancellation rejects late response and subsequent job can run',
    () async {
      final response = Completer<http.Response>();
      final files = AssistantLocalModelStore(
        directory: () async => directory,
        models: [model],
        client: () => MockClient((_) => response.future),
      );
      final operation = files.download(
        model,
        isScopeCurrent: () => true,
        onProgress: (_, _) {},
      );
      await Future<void>.delayed(Duration.zero);
      files.cancel();
      response.complete(http.Response.bytes(bytes, 200));
      await expectLater(operation, throwsA(isA<LocalModelException>()));
      expect(await files.verifiedFile(model), isNull);
      await files.download(
        model,
        isScopeCurrent: () => true,
        onProgress: (_, _) {},
      );
      expect(await files.verifiedFile(model), isNotNull);
    },
  );
}
