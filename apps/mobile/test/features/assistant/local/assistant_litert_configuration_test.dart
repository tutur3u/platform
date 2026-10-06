import 'dart:async';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_edge_ai/flutter_edge_ai.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/local/assistant_litert_runtime.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_local_model_store.dart';
import 'package:mobile/features/assistant/local/assistant_local_preferences.dart';
import 'package:mobile/features/assistant/local/assistant_local_runtime.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _NativeModel extends Mock implements InferenceModel {}

void main() {
  test('actual Qwen adapter honors the pinned 4096-context artifact', () async {
    var calls = 0;
    await loadAssistantLiteRtModel(
      '/app-support/mira-local-models/qwen3-600m.litertlm',
      createModel: (spec, config) async {
        calls++;
        expect(config.maxTokens, 4096);
        expect(
          config.modelPath,
          '/app-support/mira-local-models/qwen3-600m.litertlm',
        );
        expect(spec.fileType, ModelFileType.litertlm);
        expect(spec.modelType, ModelType.general);
        return _NativeModel();
      },
    );
    expect(calls, 1);
  });

  for (final entry in assistantLocalModels) {
    test('${entry.id} resolves only its app-owned filename', () async {
      await loadAssistantLiteRtModel(
        '/app-support/${entry.id}.litertlm',
        createModel: (spec, config) async {
          expect(spec.name, entry.name);
          expect(config.maxTokens, entry.id == 'qwen3-600m' ? 4096 : 2048);
          expect(config.preferredBackend, PreferredBackend.cpu);
          expect(config.maxConcurrentSessions, 1);
          expect(spec.modelType, ModelType.general);
          return _NativeModel();
        },
      );
    });
  }

  for (final filename in [
    'unknown.litertlm',
    'Qwen3-0.6B.litertlm',
    'qwen3-600m.litertlm.part',
    'prefix-qwen3-600m.litertlm',
  ]) {
    test(
      'rejects non-store basename $filename before native admission',
      () async {
        var called = false;
        await expectLater(
          loadAssistantLiteRtModel(
            '/app-support/$filename',
            createModel: (_, _) async {
              called = true;
              return _NativeModel();
            },
          ),
          throwsArgumentError,
        );
        expect(called, isFalse);
      },
    );
  }

  test(
    'real import survives a new store and preference instance before prepare',
    () async {
      SharedPreferences.setMockInitialValues({});
      final directory = await Directory.systemTemp.createTemp('mira-restart-');
      addTearDown(() => directory.delete(recursive: true));
      const bytes = [1, 2, 3, 4];
      final synthetic = AssistantLocalModel(
        id: 'qwen3-600m',
        name: 'Synthetic integrity fixture',
        repository: 'test/model',
        revision: 'fixed',
        filename: 'fixture.litertlm',
        sha256: sha256.convert(bytes).toString(),
        bytes: bytes.length,
        licenseUrl: 'https://example.com/license',
      );
      AssistantLocalModelStore newStore() => AssistantLocalModelStore(
        directory: () async => directory,
        models: [synthetic],
      );
      final source = await File(
        '${directory.path}/import.bin',
      ).writeAsBytes(bytes);
      final published = await newStore().importFile(
        synthetic,
        source,
        isScopeCurrent: () => true,
        onProgress: (_, _) {},
      );
      await AssistantLocalPreferences(
        currentUserId: () => 'actor',
      ).save('workspace', synthetic.id, isScopeCurrent: () => true);
      expect(
        await AssistantLocalPreferences(
          currentUserId: () => 'actor',
        ).load('workspace', isScopeCurrent: () => true),
        synthetic.id,
      );
      final verified = await newStore().verifiedFile(synthetic);
      expect(verified?.path, published.path);
      final native = _NativeModel();
      when(native.close).thenAnswer((_) async {});
      final scope = Object();
      final runtime = AssistantLocalRuntime(
        currentScope: () => scope,
        load: (path) => loadAssistantLiteRtModel(
          path,
          createModel: (_, config) async {
            expect(config.modelPath, verified!.path);
            expect(config.maxTokens, 4096);
            return native;
          },
        ),
      );
      await runtime.load(verified!.path);
      expect(runtime.ready, isTrue);
      await runtime.close();
      verify(native.close).called(1);
      // Tiny bytes prove persistence/config wiring, never native format compatibility.
    },
  );

  test(
    'late actual adapter result is disposed across logout/sign-in ABA',
    () async {
      final admitted = Completer<void>();
      final pending = Completer<InferenceModel>();
      Object? scope = Object();
      final runtime = AssistantLocalRuntime(
        currentScope: () => scope,
        load: (path) => loadAssistantLiteRtModel(
          path,
          createModel: (_, config) {
            expect(config.maxTokens, 4096);
            admitted.complete();
            return pending.future;
          },
        ),
      );
      final loading = runtime.load('/app-support/qwen3-600m.litertlm');
      final rejected = expectLater(loading, throwsStateError);
      await admitted.future;
      scope = null;
      await runtime.unload();
      scope = Object();
      final native = _NativeModel();
      when(native.close).thenAnswer((_) async {});
      pending.complete(native);
      await rejected;
      expect(runtime.ready, isFalse);
      verify(native.close).called(1);
      await runtime.close();
    },
  );
}
